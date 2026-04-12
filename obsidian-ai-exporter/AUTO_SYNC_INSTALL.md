# Auto Sync Setup

Personal fork of `sho7650/obsidian-AI-exporter` with an `enableAutoSync` setting that captures Claude/ChatGPT/Gemini/Perplexity conversations to your Obsidian vault with zero manual clicks.

## Why this exists

The upstream extension only syncs when you click its floating button. The maintainer declined an auto-sync feature request (#186) on complexity grounds. This fork adds ~87 lines to the same code path: page-load trigger plus a MutationObserver that re-syncs when new content streams in. Append mode handles duplicates, throttling protects against bursts.

## One-time setup

### 1. Install Obsidian Local REST API plugin

In Obsidian:
1. Settings → Community plugins → Browse
2. Search "Local REST API"
3. Install and enable
4. Open the plugin settings, **copy the API key**, leave the default ports (`27124` HTTPS, `27123` HTTP)
5. Note: the plugin uses a self-signed cert. Either trust it once via `https://127.0.0.1:27124` in your browser, or set the extension's URL to the HTTP variant `http://127.0.0.1:27123`.

### 2. Load the extension into Chrome

1. Visit `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `~/studio-kensense/obsidian-ai-exporter/dist/`
5. Pin the extension to the toolbar so you can open its popup

### 3. Configure the extension

Click the extension icon, then in the popup:
- **Obsidian URL**: `http://127.0.0.1:27123` (HTTP) or `https://127.0.0.1:27124` (HTTPS)
- **API Key**: paste from step 1
- **Vault Path**: `AI/{platform}` (or whatever you want; `{platform}` resolves to `claude`/`chatgpt`/etc.)
- **Output destinations**: Obsidian (already on by default)
- **Append Mode**: ON (critical - this is what makes re-syncing the same conversation safe)
- **Auto Sync**: ON ← the new toggle from this fork
- Click **Test Connection** then **Save**

### 4. Verify it works

1. Open any existing Claude or ChatGPT conversation
2. Wait ~3-5 seconds (the 2s initial delay + sync time)
3. Check `~/my-vault/AI/claude/` (or `AI/chatgpt/`) for a new `.md` file
4. Send a new message in the chat → wait for the assistant to finish → wait ~3s → check the file is updated

If toasts show "Saving..." then "X messages appended" / "Saved successfully" you're done.

## How auto-sync works

- **On page load**: 2 seconds after the conversation container appears, an initial sync fires. This captures the conversation as it currently exists.
- **On new messages**: A MutationObserver watches the conversation container. When new DOM content settles for 3 seconds (debounce), another sync fires. This catches assistant streaming responses.
- **Throttle**: All sync calls go through the existing `EVENT_THROTTLE_DELAY` (1s) wrapper, so bursts are coalesced.
- **Dedup**: Append mode reads the existing note, parses message hashes, and only appends genuinely new messages. Re-syncing the same conversation is a no-op if nothing changed.

## Known limitations

- **Obsidian must be running.** The Local REST API only listens when Obsidian is open. If Obsidian is closed when you chat, the sync will fail with a toast. Workaround: re-visit the conversation page after opening Obsidian, the page-load trigger will catch it.
- **Toast spam.** Auto mode shows the same "Extracting..." → "Saving..." → "Appended N messages" toasts as the manual button. Can be noisy during a long chat. If it bugs you, file an issue against this fork to add a "quiet mode" setting (~10 lines).
- **SPA navigation.** When you click between conversations inside Claude/ChatGPT without a full page reload, the content script may not re-initialize. Currently fine for refresh/new-tab usage. If needed, we can add a `history.pushState` listener (~15 lines).
- **No queue if the save fails.** If Obsidian throws an error (closed, REST API broken, etc.), the failed sync is just lost. Conversation data isn't lost (the chat platform still has it), so re-visiting the page later will recover it.

## How this relates to trove

The current `~/studio-kensense/trove/` LaunchAgent (cookie scraping via pycookiecheat + curl_cffi) is structurally fragile because:

1. Anthropic added configurable session expiration in 2025 (1/3/7 day max TTL)
2. Cloudflare TLS fingerprinting can invalidate `cf_clearance` on browser updates
3. There is no official API for either Claude or ChatGPT to list user conversations

This extension solves all three by running inside the already-authenticated browser. No cookies to expire, no TLS fingerprinting, no API to break.

**Recommended migration:**

1. Run this extension for a week alongside trove
2. Spot-check that the same conversations are appearing in both `~/my-vault/Claude/` (trove) and `~/my-vault/AI/claude/` (this extension)
3. Once confident, disable the trove LaunchAgent: `launchctl unload ~/Library/LaunchAgents/com.vault.sync-ai-chats.plist`
4. Keep `trove/` source around as a historical reference / fallback

You will lose the diary linking that `ingest_context.py` does (auto-adding chats under `## AI Chats` in daily notes). That's a separate concern - we can re-build it as a small daemon that watches `~/my-vault/AI/claude/` for new files and updates the daily note. ~50 lines, runs as another LaunchAgent, never breaks.

## Updating the fork

```bash
cd ~/studio-kensense/obsidian-ai-exporter
git fetch origin
git rebase origin/main feature/auto-sync   # may have conflicts in the 5 modified files
npm install
npm run build
# then in chrome://extensions, click the reload icon on the extension
```

## Files changed from upstream

```
src/content/index.ts | 63 ++++++++++++++++++++++++++++++++++++++++++++++++++++
src/lib/storage.ts   |  6 +++++
src/lib/types.ts     |  2 ++
src/popup/index.html | 13 +++++++++++
src/popup/index.ts   |  3 +++
```

Branch: `feature/auto-sync`
Commit: `9aef905 feat(content): add auto-sync mode for hands-free conversation capture`
