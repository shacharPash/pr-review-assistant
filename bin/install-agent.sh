#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.prreview.agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TEMPLATE="$REPO/bin/$LABEL.plist.template"
ENTRY="$REPO/dist/server/index.js"
LOG="$HOME/Library/Logs/pr-review-assistant.log"
PORT="${PORT:-5173}"
NODE_BIN="$(command -v node)"

echo "Building app (npm run build)..."
( cd "$REPO" && npm run build )
[ -f "$ENTRY" ] || { echo "ERROR: build did not produce $ENTRY" >&2; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

# Escape '&' (sed's "matched text") so a PATH entry containing it can't
# silently corrupt the rendered plist. Backslash in PATH is impossible on macOS.
SAFE_PATH="${PATH//&/\\&}"

# Render the plist. Use '|' as the sed delimiter since paths contain '/'.
sed -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__ENTRY__|$ENTRY|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__PATH__|$SAFE_PATH|g" \
    -e "s|__PORT__|$PORT|g" \
    -e "s|__LOG__|$LOG|g" \
    "$TEMPLATE" > "$PLIST"

# Reload if it was already installed, then bootstrap.
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Waiting for the server to become healthy..."
for _ in $(seq 1 20); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    echo "✅ Server running at http://localhost:$PORT"
    echo "   Pin the extension icon, then click it from any GitHub PR."
    exit 0
  fi
  sleep 0.5
done

echo "⚠️  Server did not become healthy in time. Check the log: $LOG" >&2
exit 1
