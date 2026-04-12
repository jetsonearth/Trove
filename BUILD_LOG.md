# Trove - Build Log

**Date**: 2026-04-04
**Goal**: Automate AI chat archival to Obsidian vault, replacing manual Obsidian Web Clipper workflow.

---

## 1. Problem Statement

Saving AI conversations (Claude, ChatGPT, etc.) to Obsidian required manually using the Obsidian Web Clipper browser extension for each chat. This was tedious, easy to forget, and produced inconsistent results depending on when you remembered to clip.

We needed a script that pulls conversations from AI platforms via their internal APIs and writes them as Markdown files matching the existing Obsidian Web Clipper format.

---

## 2. Discovery - Internal APIs

Explored undocumented/internal APIs for each platform:

**Claude.ai**
- `GET /api/organizations/{org_id}/chat_conversations` - list all conversations
- `GET /api/organizations/{org_id}/chat_conversations/{uuid}` - full conversation with messages
- Auth: `sessionKey` cookie

**ChatGPT**
- `GET /backend-api/conversations` - list conversations (paginated, `offset`/`limit`)
- `GET /backend-api/conversation/{id}` - full conversation detail
- Messages stored as a tree structure (`mapping` dict with `parent`/`children` refs), not a flat list
- Auth: cookies + Bearer token from `/api/auth/session`

**Kimi (Moonshot)**
- `POST /api/chat/list` - returns conversation list with metadata
- No message history endpoint found - partial support only

**DeepSeek**
- No public or discoverable API endpoints documented yet - not supported

---

## 3. Auth Challenge - Cloudflare TLS Fingerprinting

**First attempt**: `pycookiecheat` to extract Chrome cookies + `requests` library to call APIs.

**Result**: HTTP 403 - Cloudflare "Just a moment" interstitial page.

**Root cause**: Python `requests` uses its own TLS stack (urllib3/OpenSSL), which has a different TLS fingerprint than Chrome. Cloudflare's `cf_clearance` cookie is bound to the browser's TLS fingerprint at issuance time. When a request arrives with the right cookie but the wrong fingerprint, Cloudflare rejects it.

**Solution**: `curl_cffi` library with `impersonate="chrome"`. This library wraps curl-impersonate, which reproduces Chrome's exact TLS ClientHello (cipher suites, extensions, ALPN, etc.).

**Result**: HTTP 200, 1359 conversations returned on first successful call.

---

## 4. Auth Challenge - Wrong Chrome Profile

`pycookiecheat` defaults to Chrome's `Default` profile directory. Claude's `sessionKey` cookie was stored in `Profile 4` (a non-default Chrome profile).

**Solution**: Scan all Chrome profile directories (`Default`, `Profile 1`, `Profile 2`, ...) via their `Cookies` SQLite databases. For each profile, query for the target cookie domain and compare `last_access_utc` timestamps. Use the profile with the most recently accessed matching cookie.

Pass the correct `cookie_file` path to `pycookiecheat` to read from the right profile.

---

## 5. ChatGPT Quirks

**Tree-structured messages**: ChatGPT stores messages in a `mapping` dict where each node has a `parent` and `children` list. The response includes a `current_node` field pointing to the last message. To reconstruct the linear conversation, walk from `current_node` back through `parent` references, then reverse.

**Two-step auth**: Cookies alone are insufficient. The flow is:
1. Send cookies to `GET /api/auth/session`
2. Extract `accessToken` from the JSON response
3. Use `Authorization: Bearer {accessToken}` for all subsequent API calls

**Inconsistent timestamps**: `create_time` is a Unix float in the conversation list endpoint but can appear as an ISO 8601 string in the detail endpoint. Handle both formats.

---

## 6. Thinking Removal

Claude's extended thinking (chain-of-thought) content is interleaved with the actual assistant response text. There is no structured field separating thinking from response.

**Heuristic approach**: Detect an English analytical prefix (containing phrases like "the user", "let me think", "I need to", "looking at this") followed by a blank line, then CJK characters or markdown-formatted content. Strip everything before the blank line boundary.

This is imperfect - edge cases include conversations that are entirely in English, or thinking blocks that contain CJK text. Good enough for the common case.

---

## 7. Output Format

Matches the existing Obsidian Web Clipper output exactly for vault consistency:

- YAML frontmatter with `title`, `source`, `date`, `tags`
- Alternating `**You**` / `**Claude**` (or `**ChatGPT**`) headers
- Each message as a markdown block under its header
- Filename convention: `M-D-YY Title.md` (no leading zeros, e.g., `4-4-26 Building Trove.md`)

---

## 8. Architecture Decision

**Single script** (`fetch_ai_chats.py`), no framework. Dependencies: `pycookiecheat`, `curl_cffi`, `json`, `sqlite3`.

**Config**: `trove.json` (gitignored) stores org IDs, output directory, platform toggles. `trove.example.json` provides the template.

**State tracking**: `.ai_sync_state.json` stores a set of conversation UUIDs already synced. On each run, the script fetches the conversation list, diffs against known UUIDs, and only fetches detail for new conversations.

**Scheduling**: macOS LaunchAgent plist for daily runs. The script is idempotent - safe to run multiple times.

---

## 9. Backfill

Initial run successfully fetched 197 conversations from the past 2 months that had never been clipped. These were written to the Obsidian vault in the correct format, filling the gap left by forgotten manual clips.

---

## Why Python?

Two critical libraries are Python-only with no equivalent in Node.js or Go:

- **pycookiecheat**: Decrypts Chrome cookies on macOS by accessing the Keychain-stored encryption key. Chrome encrypts its cookie SQLite database with a key stored in the macOS Keychain. This library handles the Keychain access and AES decryption. No Node.js or Go library replicates this.

- **curl_cffi**: Python bindings for curl-impersonate, which reproduces browser TLS fingerprints. The `impersonate="chrome"` option sends a TLS ClientHello identical to Chrome's, bypassing Cloudflare's fingerprint check. The underlying curl-impersonate is a C project, but the only maintained high-level bindings are in Python.

---

## Known Issues

- **curl_cffi TLS errors**: Occasional `LibCurlError` on TLS handshake, particularly under network instability. Mitigated with 3x retry with exponential backoff.
- **Chrome-only**: Cookie extraction relies on Chrome's specific SQLite schema and macOS Keychain storage. Safari and Firefox use different mechanisms and are not supported.
- **Thinking removal heuristic**: May fail on all-English conversations where the thinking and response are both in English, or on thinking blocks that contain CJK content. No structured delimiter exists in the API response.
- **ChatGPT Cloudflare protection**: Stricter than Claude's. ChatGPT's Cloudflare rules rotate more aggressively and occasionally require re-authenticating in the browser to refresh `cf_clearance`. Claude's protection is more lenient with valid session cookies.
- **Kimi partial support**: Only conversation listing works. Message content retrieval is not available through discovered endpoints.
- **DeepSeek unsupported**: No API endpoints identified yet.
