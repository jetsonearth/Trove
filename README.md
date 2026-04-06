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

## How It Works

1. Reads your Chrome session cookies (auto-detects the right profile)
2. Calls the internal APIs of Claude and ChatGPT to fetch today's conversations
3. Converts them to Obsidian-compatible markdown with proper frontmatter
4. Saves to your vault, one file per conversation
5. Optionally links them into your daily note

## Setup

```bash
git clone https://github.com/jetsonearth/Trove.git
cd Trove
./setup.sh
```

That's it. The setup script:
- Installs Python dependencies (`curl_cffi`, `pycookiecheat`)
- Asks for your Obsidian vault path and Claude org ID
- Registers a daily scheduler (runs at 23:50 via macOS LaunchAgent)

**Prerequisites**: Python 3.10+, Chrome with active logins to claude.ai / chatgpt.com.

## Usage

```bash
python3 fetch_ai_chats.py                       # fetch today's chats from all providers
python3 fetch_ai_chats.py --provider claude      # claude only
python3 fetch_ai_chats.py --provider chatgpt     # chatgpt only
python3 fetch_ai_chats.py --date 2026-04-03      # fetch a specific date
python3 fetch_ai_chats.py --dry-run              # preview what would be fetched
python3 fetch_ai_chats.py --force                # re-fetch even if already exported
```

## Output

Each conversation becomes a markdown file in your vault:

```
~/my-vault/Claude/4-4-26 Demand aggregation strategy insights.md
~/my-vault/GPT/4-4-26 Red Hat Partner Certifications.md
```

With frontmatter that Obsidian can index and query:

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

## Finding Your Claude Org ID

1. Open claude.ai in Chrome
2. Open DevTools (Cmd+Option+I) -> Network tab
3. Refresh the page
4. Look for any request to `/api/organizations/{UUID}/` - that UUID is your org ID

## How Authentication Works

Trove uses two libraries to bypass Cloudflare protection without any manual configuration:

- **pycookiecheat**: Decrypts Chrome cookies from the macOS Keychain, auto-detecting the correct Chrome profile
- **curl_cffi**: Sends HTTP requests with Chrome's TLS fingerprint, so Cloudflare treats them as a real browser

This means: as long as you're logged into claude.ai / chatgpt.com in Chrome, Trove just works.

## Configuration

`trove.json` (created by setup.sh, gitignored):

```json
{
  "vault": "/path/to/your/obsidian-vault",
  "claude_org_id": "your-org-id",
  "claude_output_dir": "Claude",
  "chatgpt_output_dir": "GPT"
}
```

## Supported Providers

| Provider | Status | Auth Method |
|----------|--------|-------------|
| Claude   | Working | Chrome cookie (sessionKey) |
| ChatGPT  | Working | Chrome cookie -> Bearer token |
| DeepSeek | Planned | TBD |
| Kimi     | Planned | TBD |

## License

MIT
