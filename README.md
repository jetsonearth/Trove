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

**Your AI conversations are not just chat logs - they are your extended cognition.** Trove treats them as what they are: treasure worth keeping.

Once your conversations live in Obsidian, they become part of your knowledge graph. Link them to projects. Search across months of thinking. Feed them to agents to maintain continuity of thought. Build a second brain that actually remembers what you and your AI figured out together.

## How It Works

A Chrome extension runs a background bulk sync every 4 hours:

1. The extension's service worker wakes up via `chrome.alarms`
2. Fetches the conversation list from Claude and ChatGPT internal APIs
3. Filters to conversations from the last 24 hours
4. Fetches each conversation's full content
5. Writes markdown files directly to your vault via Obsidian Local REST API

**Auth model**: The extension runs inside Chrome and uses your existing logged-in session. No cookie scraping, no TLS fingerprint impersonation, no Cloudflare bypasses. If you can use Claude in your browser, the extension can fetch your chats.

**Failure handling**: If you're not logged into Claude/ChatGPT or Obsidian is closed, you get a Chrome desktop notification immediately - no more discovering a multi-day gap after the fact.

## Quick Start

> **Requirements:** Google Chrome (logged into [claude.ai](https://claude.ai) and/or [chatgpt.com](https://chatgpt.com)), [Obsidian](https://obsidian.md) with the Local REST API plugin, and Node.js 18+.

### Step 1: Install the Obsidian Local REST API plugin

1. Obsidian -> Settings -> Community plugins -> Browse
2. Search "Local REST API" -> Install -> Enable
3. Open the plugin settings and **copy the API key**
4. Enable the non-encrypted (HTTP) server if your system proxy intercepts localhost

### Step 2: Build and load the Chrome extension

```bash
git clone https://github.com/jetsonearth/trove.git
cd trove/obsidian-ai-exporter
npm install
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked** -> select the `dist/` folder
4. Pin the extension to the toolbar

### Step 3: Configure the extension

Click the extension icon:
- **Obsidian URL**: `http://127.0.0.1:27123` (or `https://127.0.0.1:27124` if HTTP isn't enabled)
- **API Key**: paste from step 1
- **Vault Path**: `AI/{platform}` (creates `AI/Claude/`, `AI/ChatGPT/`, etc.)
- Click **Test Connection** -> should say "Connected"
- Click **Save Settings**

### Step 4: Test it

Open the extension's service worker console:
1. `chrome://extensions` -> find the extension -> click **"service worker"** link
2. Type: `bulkSyncNow(1)` to sync today's chats
3. Watch the logs - you should see conversations being fetched and saved
4. Check your vault - you should have new markdown files

### Step 5: Done

The extension syncs automatically every 4 hours. You never need to think about it again.

To manually trigger a sync at any time, open the service worker console and type:
- `bulkSyncNow(1)` - sync last 1 day
- `bulkSyncNow(7)` - backfill last week

## What You Get

Each conversation becomes a markdown file in your vault:

```
~/my-vault/AI/Claude/4-12-26 Evaluating robotics marketplace legitimacy.md
~/my-vault/AI/ChatGPT/4-12-26 Red Hat Partner Certifications.md
```

With Obsidian-compatible frontmatter:

```yaml
---
title: "Evaluating robotics marketplace legitimacy"
source: claude
url: "https://claude.ai/chat/694ee83f-..."
created: "2026-04-12T08:30:00.000Z"
modified: "2026-04-12T16:00:00.000Z"
tags:
  - ai-conversation
  - claude
message_count: 18
---
```

Messages formatted as Obsidian callouts:

```markdown
> [!QUESTION] User
> What's the best approach for...

> [!NOTE] Claude
> Based on the analysis...
```

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| Claude | Working | claude.ai conversations |
| ChatGPT | Working | chatgpt.com conversations (including custom GPTs) |
| Gemini | Manual only | Sync button on page, no bulk sync yet |
| Perplexity | Manual only | Sync button on page, no bulk sync yet |

## Architecture

```
Chrome Extension (background service worker)
    |
    |-- chrome.alarms (every 4 hours)
    |       |
    |       |-- fetch claude.ai/api/.../chat_conversations
    |       |-- fetch chatgpt.com/backend-api/conversations
    |       |
    |       v
    |   Convert to Markdown
    |       |
    |       v
    |   PUT to Obsidian Local REST API (127.0.0.1:27123)
    |
    |-- Content script (on claude.ai / chatgpt.com pages)
            |
            |-- Manual "Sync" button (click to sync current conversation)
```

## Updating

```bash
cd trove/obsidian-ai-exporter
git pull
npm install
npm run build
# Then in chrome://extensions, click reload on the extension
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot reach Obsidian" | Make sure Obsidian is running and the Local REST API plugin is enabled. If you have a system proxy (like mihomo/clash), add `127.0.0.1` and `localhost` to the proxy bypass list. |
| No chats synced | Open the service worker console and run `bulkSyncNow(1)`. Check for auth errors - usually means you need to log into claude.ai or chatgpt.com in Chrome. |
| Chrome notification "AI Chat Sync Problem" | The extension couldn't authenticate. Open the relevant site in Chrome to refresh your session. |
| Service worker shows "Inactive" | Click the "service worker" link to wake it up. The alarm will fire on its schedule regardless. |

## License

MIT

---

## Legacy: Python Script (v1)

The original Trove used a Python daemon (`fetch_ai_chats.py`) that scraped Chrome cookies to call the same APIs externally. This approach is deprecated because:
- Anthropic added configurable session expiration (1/3/7 day max TTL)
- Cloudflare TLS fingerprinting breaks periodically with browser updates
- Silent failures led to multi-day gaps before anyone noticed

The Python script and LaunchAgent setup (`setup.sh`) are preserved in this repo for reference but are no longer the recommended approach. Use the Chrome extension instead.
