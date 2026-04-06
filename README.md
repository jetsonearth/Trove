<p align="center">
  <h1 align="center">Trove</h1>
  <p align="center"><b>Your AI conversations are treasure. Stop letting them disappear.</b></p>
  <p align="center">
    <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
  </p>
</p>

## Why Trove?

Every day, you have dozens of conversations with AI - brainstorming product ideas, debugging gnarly code, researching unfamiliar domains, making decisions. Each conversation is a snapshot of your thinking: the questions you asked, the reasoning you followed, the conclusions you reached.

But these conversations vanish. They sit buried in Claude's sidebar or ChatGPT's history, unsearchable, disconnected from each other, and invisible to the tools you actually use. You can't grep them. You can't link them to your notes. You can't feed them back to an agent that needs to understand how you think.

**Your AI conversations are not just chat logs - they are your extended cognition.** They capture moments of insight, chains of reasoning, and idea generation that your brain alone can't retain. They are context - the kind of context that makes the difference between an AI assistant that starts from zero every time and one that truly understands your work.

Trove treats these conversations as what they are: treasure worth keeping. It automatically syncs your daily Claude and ChatGPT conversations into your Obsidian vault as clean, searchable markdown. No manual export, no copy-paste, no configuration headaches - it reads cookies directly from Chrome and just works.

Once your conversations live in Obsidian, they become part of your knowledge graph. Link them to projects. Search across months of thinking. Feed them to agents to maintain continuity of thought. Build a second brain that actually remembers what you and your AI figured out together.

## Quick Start

> **Requirements:** macOS, Python 3.10+, Google Chrome logged into [claude.ai](https://claude.ai) and/or [chatgpt.com](https://chatgpt.com), and an [Obsidian](https://obsidian.md) vault.

### Step 1: Install

```bash
git clone https://github.com/jetsonearth/Trove.git
cd Trove
./setup.sh
```

The setup script will ask you two things:

| Prompt | What to enter |
|--------|---------------|
| **Obsidian vault path** | The full path to your vault folder, e.g. `~/my-vault` |
| **Claude org ID** | Press Enter to skip (Trove will try to auto-detect it at runtime), or paste your org ID if you already have it. See [How to find your Claude org ID](#how-to-find-your-claude-org-id) if auto-detection doesn't work. |

It then installs dependencies and sets up a daily scheduler (runs every night at 23:50).

### Step 2: Test it

```bash
python3 fetch_ai_chats.py --dry-run
```

This previews what would be fetched without writing anything. You should see a list of today's conversations. If you see errors, check the [Troubleshooting](#troubleshooting) section.

### Step 3: Run it for real

```bash
python3 fetch_ai_chats.py
```

Done. Check your Obsidian vault - your conversations are there.

From now on, Trove runs automatically every night. You can also run it manually anytime.

## Usage

```bash
python3 fetch_ai_chats.py                       # fetch today's chats from all providers
python3 fetch_ai_chats.py --provider claude      # claude only
python3 fetch_ai_chats.py --provider chatgpt     # chatgpt only
python3 fetch_ai_chats.py --date 2026-04-03      # fetch a specific date
python3 fetch_ai_chats.py --dry-run              # preview what would be fetched
python3 fetch_ai_chats.py --force                # re-fetch even if already exported
```

## What You Get

Each conversation becomes a markdown file in your vault:

```
~/my-vault/Claude/4-4-26 Demand aggregation strategy insights.md
~/my-vault/GPT/4-4-26 Red Hat Partner Certifications.md
```

Each file has Obsidian-compatible frontmatter so you can search, tag, and link them:

```yaml
---
title: "Demand aggregation strategy insights"
source: "https://claude.ai/chat/694ee83f-..."
author:
  - "[[Claude]]"
created: 2026-04-04
description: "Claude conversation with 18 messages"
tags:
  - "Claude"
---
```

## How It Works

1. Reads your Chrome session cookies (auto-detects the right profile)
2. Calls the Claude / ChatGPT APIs to fetch today's conversations
3. Converts them to clean markdown with frontmatter
4. Saves to your vault, one file per conversation

**Authentication:** Trove uses [pycookiecheat](https://github.com/n8henrie/pycookiecheat) to decrypt Chrome cookies from the macOS Keychain, and [curl_cffi](https://github.com/lexiforest/curl_cffi) to send requests with Chrome's TLS fingerprint. No API keys needed - as long as you're logged in via Chrome, it just works.

## Configuration

`trove.json` (created by setup.sh, gitignored):

```json
{
  "vault": "/path/to/your/obsidian-vault",
  "claude_org_id": "",
  "claude_output_dir": "Claude",
  "chatgpt_output_dir": "GPT"
}
```

| Field | Description | Required? |
|-------|-------------|-----------|
| `vault` | Absolute path to your Obsidian vault | Yes |
| `claude_org_id` | Your Claude organization UUID. Leave empty for auto-detection | No |
| `claude_output_dir` | Subfolder in vault for Claude conversations | No (default: `Claude`) |
| `chatgpt_output_dir` | Subfolder in vault for ChatGPT conversations | No (default: `GPT`) |

## How to Find Your Claude Org ID

Trove tries to auto-detect this, but if it fails, you can find it manually:

1. Open [claude.ai](https://claude.ai) in Chrome
2. Open DevTools: **Cmd + Option + I**
3. Go to the **Network** tab
4. Refresh the page
5. Click on any request in the list, and look at the request URL - you'll see something like `/api/organizations/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/...`
6. Copy that UUID and paste it into `trove.json` as `claude_org_id`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Could not find 'sessionKey' cookie` | You're not logged into claude.ai in Chrome. Log in and try again. |
| `Could not find '__Secure-next-auth.session-token' cookie` | You're not logged into chatgpt.com in Chrome. Log in and try again. |
| `Could not determine org ID` | Set `claude_org_id` manually in `trove.json`. To find it: open claude.ai -> DevTools (Cmd+Option+I) -> Network tab -> refresh -> look for `/api/organizations/{UUID}/` in any request URL. |
| `No new conversations to export` | You have no conversations from today. Try `--date YYYY-MM-DD` to fetch a different date. |
| `pip3 install` fails | Try `pip3 install --user curl_cffi pycookiecheat` or use a virtualenv. |

## Supported Providers

| Provider | Status | Auth Method |
|----------|--------|-------------|
| Claude   | Working | Chrome cookie (sessionKey) |
| ChatGPT  | Working | Chrome cookie -> Bearer token |
| DeepSeek | Planned | TBD |
| Kimi     | Planned | TBD |

## License

MIT
