#!/usr/bin/env bash
#
# One-step setup for PR Review Assistant.
# Idempotent — re-runs are safe (will only do what's still needed).
#
# Usage:
#   bash bin/setup.sh
#
# What it does:
#   1. Verifies node + npm + gh + claude are on PATH (prints fix hints if not).
#   2. Runs `npm install` if node_modules is missing or package-lock changed.
#   3. Creates .env from .env.example if not present (no real values).
#   4. Prints next-step instructions.
#
# Designed to be the only command a teammate has to run after cloning.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ok()    { printf "\033[32m✓\033[0m %s\n"  "$1"; }
warn()  { printf "\033[33m⚠\033[0m %s\n"  "$1"; }
miss()  { printf "\033[31m✗\033[0m %s\n"  "$1"; }
title() { printf "\n\033[1m%s\033[0m\n"   "$1"; }

title "Checking required tools"

NODE_OK=1
if ! command -v node >/dev/null 2>&1; then
  miss "node not found. Install Node 20+ from https://nodejs.org"
  NODE_OK=0
else
  NODE_VERSION="$(node --version)"
  ok "node $NODE_VERSION"
fi

if ! command -v npm >/dev/null 2>&1; then
  miss "npm not found (should ship with node)."
  NODE_OK=0
else
  ok "npm $(npm --version)"
fi

if ! command -v gh >/dev/null 2>&1; then
  miss "gh CLI not found. Install from https://cli.github.com, then run \`gh auth login\`."
else
  ok "gh $(gh --version | head -1 | awk '{print $3}')"
  if ! gh auth status >/dev/null 2>&1; then
    warn "gh is installed but not authenticated. Run: gh auth login"
  fi
fi

if ! command -v claude >/dev/null 2>&1; then
  warn "claude CLI not found. Install from https://claude.ai/code — without it, AI features (brief / tweet / plain-english) won't work but the diff viewer still does."
else
  ok "claude $(claude --version 2>/dev/null | head -1 || echo 'present')"
fi

[ "$NODE_OK" = "1" ] || { echo; miss "Fix the missing tools above, then re-run."; exit 1; }

title "Installing npm dependencies"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install
  ok "Dependencies installed"
else
  ok "Dependencies up to date — skipping npm install"
fi

title "Local config"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
  warn "Optional: edit .env to enable Jira links — see README for details"
elif [ -f .env ]; then
  ok ".env already present"
else
  warn ".env.example not found — skipping env setup"
fi

title "All set"
echo
echo "Run the app with:"
echo "  npm run dev"
echo
echo "Then open http://localhost:5173 and paste a GitHub PR URL."
