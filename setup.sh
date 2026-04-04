#!/bin/bash
# Trove - one-line setup
# Usage: ./setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.trove.ai-chat-sync"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
PYTHON="$(which python3)"

echo "=== Trove Setup ==="
echo

# 1. Install Python dependencies
echo "[1/3] Installing dependencies..."
pip3 install curl_cffi pycookiecheat --quiet
echo "  Done."

# 2. Interactive config
CONFIG_FILE="$SCRIPT_DIR/trove.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo
    echo "[2/3] First-time configuration..."
    read -p "  Obsidian vault path [~/my-vault]: " vault_path
    vault_path="${vault_path:-$HOME/my-vault}"
    vault_path="${vault_path/#\~/$HOME}"

    echo "  To find your Claude org ID:"
    echo "    1. Open claude.ai in Chrome"
    echo "    2. Look at any API request in DevTools Network tab"
    echo "    3. The URL contains /organizations/{YOUR_ORG_ID}/"
    read -p "  Claude org ID: " org_id

    cat > "$CONFIG_FILE" << JSONEOF
{
  "vault": "$vault_path",
  "claude_org_id": "$org_id",
  "claude_output_dir": "Claude",
  "chatgpt_output_dir": "GPT",
  "sync_script": "scripts/sync_ai_chats.py",
  "state_file": "scripts/.ai_sync_state.json"
}
JSONEOF
    echo "  Config saved to $CONFIG_FILE"
else
    echo "[2/3] Config already exists at $CONFIG_FILE"
fi

# 3. Install LaunchAgent (daily at 23:50)
echo
echo "[3/3] Installing daily scheduler (runs at 23:50)..."
cat > "$PLIST_PATH" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PYTHON</string>
        <string>$SCRIPT_DIR/fetch_ai_chats.py</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>23</integer>
        <key>Minute</key>
        <integer>50</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/.trove.log</string>
    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/.trove.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "  Scheduler installed. Will run daily at 23:50."

echo
echo "=== Setup complete ==="
echo
echo "Test it now:"
echo "  python3 $SCRIPT_DIR/fetch_ai_chats.py --dry-run"
echo
echo "Or fetch today's chats:"
echo "  python3 $SCRIPT_DIR/fetch_ai_chats.py"
