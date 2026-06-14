#!/usr/bin/env bash
set -euo pipefail

# Enable/disable opening the PR Review Assistant at login.
# Usage: bin/autostart.sh [on|off]
#
# "on" installs a launchd agent whose only action is `open <launcher>.command`
# at login — so Terminal starts the server in your interactive session (where
# org-managed Claude refreshes its login). Running the server directly from
# launchd does NOT work for org-managed Claude; routing through Terminal does.

LABEL="com.prreview.autostart"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$REPO/bin/$LABEL.plist.template"
LAUNCHER="${LAUNCHER_PATH:-$HOME/Desktop/PR Review Assistant.command}"

case "${1:-on}" in
  on)
    if [ ! -f "$LAUNCHER" ]; then
      echo "Launcher not found: $LAUNCHER" >&2
      echo "Run 'npm run make-launcher' first." >&2
      exit 1
    fi
    mkdir -p "$HOME/Library/LaunchAgents"
    sed -e "s|__LAUNCHER__|$LAUNCHER|g" "$TEMPLATE" > "$PLIST"
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "✅ Auto-start enabled — the server opens in Terminal at login (and just started one now)."
    echo "   Turn it off any time with: npm run autostart-off"
    ;;
  off)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✅ Auto-start disabled."
    ;;
  *)
    echo "usage: bin/autostart.sh [on|off]" >&2
    exit 1
    ;;
esac
