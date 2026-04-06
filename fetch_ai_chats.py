#!/usr/bin/env python3
"""Fetch AI chat conversations from Claude and ChatGPT, save as Obsidian markdown.

Fully automatic: reads cookies directly from Chrome (no manual setup needed).
Just make sure you're logged into claude.ai / chatgpt.com in Chrome.

Usage:
    python fetch_ai_chats.py                       # fetch today's chats
    python fetch_ai_chats.py --date 2026-04-03     # fetch specific date
    python fetch_ai_chats.py --provider claude     # claude only
    python fetch_ai_chats.py --dry-run             # preview without writing
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from curl_cffi import requests as cffi_requests
from pycookiecheat import chrome_cookies

# ---------------------------------------------------------------------------
# Config - loaded from trove.json next to this script, or defaults
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_FILE = SCRIPT_DIR / "trove.json"


def load_config() -> dict:
    defaults = {
        "vault": str(Path.home() / "my-vault"),
        "claude_org_id": "",
        "claude_output_dir": "Claude",
        "chatgpt_output_dir": "GPT",
        "sync_script": "scripts/sync_ai_chats.py",
        "state_file": "scripts/.ai_sync_state.json",
    }
    if CONFIG_FILE.exists():
        user = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        defaults.update(user)
    return defaults


CFG = load_config()
VAULT = Path(CFG["vault"])
STATE_FILE = VAULT / CFG["state_file"]
SYNC_SCRIPT = VAULT / CFG["sync_script"]
CLAUDE_ORG_ID = CFG["claude_org_id"]
CLAUDE_BASE = f"https://claude.ai/api/organizations/{CLAUDE_ORG_ID}" if CLAUDE_ORG_ID else ""
CLAUDE_OUTPUT_DIR = VAULT / CFG["claude_output_dir"]
CHATGPT_OUTPUT_DIR = VAULT / CFG["chatgpt_output_dir"]
CHROME_USER_DATA = Path.home() / "Library/Application Support/Google/Chrome"


# ---------------------------------------------------------------------------
# Auto cookie extraction from Chrome
# ---------------------------------------------------------------------------


def find_chrome_profile_with_cookie(domain: str, cookie_name: str) -> Path | None:
    """Find the Chrome profile with the most recently used matching cookie."""
    import sqlite3

    profiles = ["Default"] + [
        p.name for p in CHROME_USER_DATA.iterdir()
        if p.is_dir() and p.name.startswith("Profile")
    ]

    best_path = None
    best_time = 0

    for profile in profiles:
        db_path = CHROME_USER_DATA / profile / "Cookies"
        if not db_path.exists():
            continue
        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.execute(
                "SELECT MAX(last_access_utc) FROM cookies WHERE host_key LIKE ? AND name LIKE ?",
                (f"%{domain}%", f"{cookie_name}%"),
            )
            row = cursor.fetchone()
            conn.close()
            if row and row[0] and row[0] > best_time:
                best_time = row[0]
                best_path = db_path
        except Exception:
            continue
    return best_path


def get_cookies_for_domain(domain: str, key_cookie: str) -> str:
    """Auto-detect Chrome profile and extract cookies as a header string."""
    cookie_file = find_chrome_profile_with_cookie(domain, key_cookie)
    if not cookie_file:
        raise RuntimeError(
            f"Could not find '{key_cookie}' cookie for {domain} in any Chrome profile. "
            f"Make sure you're logged into {domain} in Chrome."
        )

    cookies = chrome_cookies(f"https://{domain}", cookie_file=str(cookie_file))
    has_key = any(k == key_cookie or k.startswith(key_cookie) for k in cookies)
    if not has_key:
        raise RuntimeError(
            f"Cookie '{key_cookie}' not found for {domain}. "
            f"Try logging out and back in on {domain}."
        )

    return "; ".join(f"{k}={v}" for k, v in cookies.items())


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Trove - sync AI chats to Obsidian.")
    p.add_argument("--date", help="Target date YYYY-MM-DD. Defaults to today.")
    p.add_argument("--provider", choices=["claude", "chatgpt", "all"], default="all")
    p.add_argument("--dry-run", action="store_true", help="Preview without writing.")
    p.add_argument("--force", action="store_true", help="Re-fetch already exported.")
    return p.parse_args()


def parse_target_date(raw: str | None) -> dt.date:
    return dt.date.fromisoformat(raw) if raw else dt.date.today()


def make_filename(target_date: dt.date, title: str) -> str:
    month = target_date.month
    day = target_date.day
    year = target_date.year % 100
    safe = re.sub(r'[\\/:*?"<>|]', "", title).strip() or "Untitled"
    return f"{month}-{day}-{year:02d} {safe}.md"


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {"claude": [], "chatgpt": []}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def is_same_date(iso_ts: str, target: dt.date) -> bool:
    parsed = dt.datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    return parsed.date() == target


def is_same_date_unix(ts_value: float | str, target: dt.date) -> bool:
    if isinstance(ts_value, str):
        try:
            return is_same_date(ts_value, target)
        except Exception:
            ts_value = float(ts_value)
    parsed = dt.datetime.fromtimestamp(ts_value, tz=dt.timezone.utc)
    return parsed.date() == target


def run_sync(target_date: dt.date) -> None:
    if SYNC_SCRIPT.exists():
        subprocess.run(
            [sys.executable, str(SYNC_SCRIPT), "--date", target_date.isoformat()],
            check=False,
        )


def cffi_get(url: str, cookie_str: str, retries: int = 3, **kwargs) -> cffi_requests.Response:
    """GET with Chrome TLS impersonation and automatic retry."""
    headers = {
        "Cookie": cookie_str,
        "Accept": "application/json",
        "Referer": kwargs.pop("referer", ""),
        "Origin": kwargs.pop("origin", ""),
    }
    headers = {k: v for k, v in headers.items() if v}
    extra_headers = kwargs.pop("extra_headers", None)
    if extra_headers:
        headers.update(extra_headers)
    for attempt in range(retries):
        try:
            return cffi_requests.get(url, headers=headers, impersonate="chrome", **kwargs)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(1)


# ---------------------------------------------------------------------------
# Claude provider
# ---------------------------------------------------------------------------


def claude_strip_thinking(text: str) -> str:
    """Remove thinking/reasoning prefix from assistant messages."""
    lines = text.split("\n")
    if len(lines) <= 3:
        return text

    for i, line in enumerate(lines):
        if i == 0:
            continue
        stripped = line.strip()
        if i > 0 and lines[i - 1].strip() == "" and stripped:
            has_cjk = bool(re.search(r"[\u4e00-\u9fff\u3400-\u4dbf]", stripped))
            starts_md = stripped.startswith(("#", "**", "- ", "1.", ">", "```"))
            if has_cjk or starts_md:
                prefix_lower = "\n".join(lines[:i]).strip().lower()
                indicators = [
                    "let me", "the user", "i should", "i need to",
                    "this is", "they want", "he/she", "let's think",
                    "i'll ", "here's my", "my approach",
                    "is asking", "is describing", "is saying",
                ]
                if any(ind in prefix_lower for ind in indicators):
                    return "\n".join(lines[i:]).strip()
    return text


def claude_to_markdown(conv: dict) -> str:
    uuid = conv["uuid"]
    title = conv.get("name") or "Untitled"
    created = conv["created_at"][:10]
    messages = conv.get("chat_messages", [])

    parts = [
        "---",
        f'title: "{title}"',
        f'source: "https://claude.ai/chat/{uuid}"',
        "author:",
        '  - "[[Claude]]"',
        "published:",
        f"created: {created}",
        f'description: "Claude conversation with {len(messages)} messages"',
        "tags:",
        '  - "Claude"',
        "---",
    ]

    for msg in messages:
        sender = msg.get("sender", "")
        text = msg.get("text", "")
        if sender == "human":
            parts.extend(["**You**", "", text])
        elif sender == "assistant":
            parts.extend(["**Claude**", "", claude_strip_thinking(text)])
        else:
            continue
        parts.extend(["", "---", ""])

    while parts and parts[-1].strip() in ("", "---"):
        parts.pop()
    parts.append("")
    return "\n".join(parts)


def claude_auto_detect_org_id(cookie_str: str) -> str:
    """Auto-detect Claude org ID from the API."""
    try:
        resp = cffi_get(
            "https://claude.ai/api/organizations",
            cookie_str,
            referer="https://claude.ai/",
            origin="https://claude.ai",
        )
        resp.raise_for_status()
        orgs = resp.json()
        if orgs:
            org_id = orgs[0].get("uuid", "")
            if org_id:
                print(f"[Claude] Auto-detected org ID: {org_id[:8]}...")
                return org_id
    except Exception:
        pass
    return ""


def fetch_claude(target_date: dt.date, state: dict, dry_run: bool, force: bool) -> int:
    try:
        cookie_str = get_cookies_for_domain("claude.ai", "sessionKey")
    except RuntimeError as e:
        print(f"[Claude] {e}", file=sys.stderr)
        return 0

    org_id = CLAUDE_ORG_ID or claude_auto_detect_org_id(cookie_str)
    if not org_id:
        print("[Claude] Could not determine org ID. Set claude_org_id in trove.json.", file=sys.stderr)
        return 0

    claude_base = f"https://claude.ai/api/organizations/{org_id}"

    try:
        resp = cffi_get(
            f"{claude_base}/chat_conversations",
            cookie_str,
            referer="https://claude.ai/",
            origin="https://claude.ai",
        )
        resp.raise_for_status()
        conversations = resp.json()
    except Exception as e:
        print(f"[Claude] Failed to list conversations: {e}", file=sys.stderr)
        return 0

    exported = set(state.get("claude", []))
    count = 0

    for conv in conversations:
        created = conv.get("created_at", "")
        uuid = conv.get("uuid", "")
        if not is_same_date(created, target_date):
            continue
        if uuid in exported and not force:
            continue

        title = conv.get("name") or "Untitled"
        filename = make_filename(target_date, title)
        output_path = CLAUDE_OUTPUT_DIR / filename

        if dry_run:
            tag = "(exists)" if output_path.exists() else "(new)"
            print(f"[Claude] {tag} {filename}")
            count += 1
            continue

        try:
            r = cffi_get(
                f"{claude_base}/chat_conversations/{uuid}",
                cookie_str,
                referer="https://claude.ai/",
                origin="https://claude.ai",
            )
            r.raise_for_status()
            full_conv = r.json()
        except Exception as e:
            print(f"[Claude] Failed to fetch {uuid}: {e}", file=sys.stderr)
            continue

        CLAUDE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_text(claude_to_markdown(full_conv), encoding="utf-8")
        exported.add(uuid)
        count += 1
        print(f"[Claude] Saved {filename}")
        time.sleep(0.5)

    state["claude"] = list(exported)
    return count


# ---------------------------------------------------------------------------
# ChatGPT provider
# ---------------------------------------------------------------------------


def chatgpt_walk_tree(mapping: dict, current_node: str) -> list[dict]:
    path = []
    node_id = current_node
    while node_id and node_id in mapping:
        node = mapping[node_id]
        msg = node.get("message")
        if msg and msg.get("content", {}).get("parts"):
            role = msg.get("author", {}).get("role", "")
            if role in ("user", "assistant"):
                text = "\n".join(
                    str(p) for p in msg["content"]["parts"] if isinstance(p, str)
                )
                if text.strip():
                    path.append({"role": role, "text": text})
        node_id = node.get("parent")
    path.reverse()
    return path


def chatgpt_to_markdown(conv: dict) -> str:
    conv_id = conv.get("conversation_id", conv.get("id", ""))
    title = conv.get("title") or "Untitled"
    create_time = conv.get("create_time", 0)
    if isinstance(create_time, str):
        created = create_time[:10]
    else:
        created = dt.datetime.fromtimestamp(create_time, tz=dt.timezone.utc).strftime("%Y-%m-%d")

    mapping = conv.get("mapping", {})
    current_node = conv.get("current_node", "")
    messages = chatgpt_walk_tree(mapping, current_node)

    parts = [
        "---",
        f'title: "{title}"',
        f'source: "https://chatgpt.com/c/{conv_id}"',
        "author:",
        '  - "[[ChatGPT]]"',
        "published:",
        f"created: {created}",
        f'description: "ChatGPT conversation with {len(messages)} messages"',
        "tags:",
        '  - "Clippings"',
        "---",
    ]

    for msg in messages:
        if msg["role"] == "user":
            parts.append("**You said**")
        else:
            parts.append("**ChatGPT said**")
        parts.extend(["", msg["text"], "", "---", ""])

    while parts and parts[-1].strip() in ("", "---"):
        parts.pop()
    parts.append("")
    return "\n".join(parts)


def fetch_chatgpt(target_date: dt.date, state: dict, dry_run: bool, force: bool) -> int:
    try:
        cookie_str = get_cookies_for_domain("chatgpt.com", "__Secure-next-auth.session-token")
    except RuntimeError as e:
        print(f"[ChatGPT] {e}", file=sys.stderr)
        return 0

    try:
        resp = cffi_get("https://chatgpt.com/api/auth/session", cookie_str)
        resp.raise_for_status()
        token = resp.json().get("accessToken")
        if not token:
            raise RuntimeError("No accessToken in session response")
    except Exception as e:
        print(f"[ChatGPT] Auth failed: {e}", file=sys.stderr)
        return 0

    try:
        resp = cffi_get(
            "https://chatgpt.com/backend-api/conversations?limit=100&offset=0",
            cookie_str,
            extra_headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        conversations = resp.json().get("items", [])
    except Exception as e:
        print(f"[ChatGPT] Failed to list conversations: {e}", file=sys.stderr)
        return 0

    exported = set(state.get("chatgpt", []))
    count = 0

    for conv in conversations:
        create_time = conv.get("create_time", 0)
        conv_id = conv.get("id", "")
        if not is_same_date_unix(create_time, target_date):
            continue
        if conv_id in exported and not force:
            continue

        title = conv.get("title") or "Untitled"
        filename = make_filename(target_date, title)
        output_path = CHATGPT_OUTPUT_DIR / filename

        if dry_run:
            tag = "(exists)" if output_path.exists() else "(new)"
            print(f"[ChatGPT] {tag} {filename}")
            count += 1
            continue

        try:
            r = cffi_get(
                f"https://chatgpt.com/backend-api/conversation/{conv_id}",
                cookie_str,
                extra_headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            full_conv = r.json()
        except Exception as e:
            print(f"[ChatGPT] Failed to fetch {conv_id}: {e}", file=sys.stderr)
            continue

        CHATGPT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_path.write_text(chatgpt_to_markdown(full_conv), encoding="utf-8")
        exported.add(conv_id)
        count += 1
        print(f"[ChatGPT] Saved {filename}")
        time.sleep(1)

    state["chatgpt"] = list(exported)
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    args = parse_args()
    target_date = parse_target_date(args.date)
    state = load_state()
    total = 0

    print(f"Fetching AI chats for {target_date.isoformat()}...")

    if args.provider in ("claude", "all"):
        total += fetch_claude(target_date, state, args.dry_run, args.force)

    if args.provider in ("chatgpt", "all"):
        total += fetch_chatgpt(target_date, state, args.dry_run, args.force)

    if not args.dry_run:
        save_state(state)
        if total > 0:
            print(f"\nSaved {total} conversation(s). Running sync...")
            run_sync(target_date)
        else:
            print("No new conversations to export.")
    else:
        print(f"\n[dry-run] Would export {total} conversation(s).")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
