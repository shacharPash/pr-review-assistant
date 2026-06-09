# One-Click PR Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From any GitHub PR page, one click on a pinned Chrome toolbar icon opens the PR Review Assistant in a new tab with that PR pre-loaded, backed by an always-on local server installed via a macOS launchd agent.

**Architecture:** A Manifest V3 Chrome extension (`activeTab` + `localhost` host permission only — nothing injected into GitHub, no `github.com` permission) reads the active tab's URL on click, health-checks the local server, and opens `http://localhost:5173/?pr=<encoded PR url>`. The app **already** reads `?pr=` and loads it (App.tsx:34), and the server parser **already** accepts full GitHub PR URLs (ghFetcher.ts:23), so no app/server code changes are needed for the deep-link. A launchd agent runs the *built* server (`node dist/server/index.js`) so it is always available with near-zero idle cost and no orphan processes.

**Tech Stack:** Chrome Manifest V3 (ES-module service worker), vanilla JS for the extension, vitest for the one pure module, macOS `launchd` + bash for the auto-start agent.

**Reference spec:** `docs/superpowers/specs/2026-06-09-one-click-pr-review-design.md`

---

## File Structure

**Create:**
- `extension/manifest.json` — MV3 manifest (permissions, action, icons, background worker)
- `extension/src/prUrl.js` — PURE module: parse a tab URL → PR parts, canonicalize, build the target URL
- `extension/src/prUrl.test.ts` — vitest unit tests for `prUrl.js`
- `extension/service-worker.js` — thin `chrome.*` glue (click handler, health check, open tab)
- `extension/help.html` — shown when the server is unreachable
- `bin/com.prreview.agent.plist.template` — launchd plist with placeholders
- `bin/install-agent.sh` — build, render plist, load agent, health-check
- `bin/uninstall-agent.sh` — unload + remove plist

**Modify:**
- `vitest.config.ts:31` — add `extension` to the test `include` glob
- `package.json` — add `install-agent` / `uninstall-agent` scripts
- `README.md` — add an "Even faster: the Chrome extension" section

**Already exist (no change):**
- `extension/icons/icon-{16,32,48,128}.png` (+ `icon-1024.png` master) — generated already
- App `?pr=` auto-load (App.tsx:34-38) and server `parsePRRef` URL support (ghFetcher.ts:23) — verified in Task 1

---

## Task 1: Verify the existing deep-link works end-to-end

No code change — this confirms the foundation the extension relies on before we build it.

**Files:**
- Read only: `client/src/App.tsx:34-38`, `server/services/ghFetcher.ts:23`, `server/services/__tests__/ghFetcher.test.ts`

- [ ] **Step 1: Run the existing parser tests**

Run: `npm test -- ghFetcher`
Expected: PASS, including `parses a full GitHub PR URL` and the `owner/repo#number` cases.

- [ ] **Step 2: Manually confirm the `?pr=` deep-link loads a PR**

Run (in one terminal): `npm start`
Then open in a browser:
`http://localhost:5173/?pr=https%3A%2F%2Fgithub.com%2Fcli%2Fcli%2Fpull%2F13509`
Expected: the app auto-loads PR cli/cli#13509 (diff + TL;DR begin) **without** any manual paste. This is exactly the URL shape the extension will produce.

- [ ] **Step 3: Note the result**

If both pass, the deep-link foundation is confirmed and the extension only needs to open this URL. If Step 2 fails, STOP and reconcile before continuing — the rest of the plan assumes `?pr=<full url>` works.

---

## Task 2: Pure URL module for the extension

The only unit-tested logic in the extension. Kept pure (no `chrome.*`, no `fetch`) so it is trivially testable.

**Files:**
- Create: `extension/src/prUrl.js`
- Test: `extension/src/prUrl.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Add `extension` to the vitest include glob**

In `vitest.config.ts`, change the `include` line:

```ts
    include: ['{server,shared,client,extension}/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing test**

Create `extension/src/prUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePrUrl, canonicalPrUrl, buildTargetUrl } from './prUrl.js';

describe('parsePrUrl', () => {
  it('parses a PR page URL', () => {
    expect(parsePrUrl('https://github.com/cli/cli/pull/13509')).toEqual({
      owner: 'cli',
      repo: 'cli',
      number: 13509,
    });
  });

  it('parses a PR sub-page URL (files/commits/hash)', () => {
    expect(parsePrUrl('https://github.com/cli/cli/pull/13509/files#diff-abc')).toEqual({
      owner: 'cli',
      repo: 'cli',
      number: 13509,
    });
  });

  it('returns null for a non-PR github URL', () => {
    expect(parsePrUrl('https://github.com/cli/cli/issues/42')).toBeNull();
  });

  it('returns null for a non-github URL', () => {
    expect(parsePrUrl('https://example.com/cli/cli/pull/1')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parsePrUrl(undefined)).toBeNull();
  });
});

describe('canonicalPrUrl', () => {
  it('rebuilds a clean PR URL from parsed parts', () => {
    expect(canonicalPrUrl({ owner: 'cli', repo: 'cli', number: 13509 })).toBe(
      'https://github.com/cli/cli/pull/13509',
    );
  });
});

describe('buildTargetUrl', () => {
  it('builds the localhost target with an encoded ?pr=', () => {
    expect(
      buildTargetUrl('https://github.com/cli/cli/pull/13509', 'http://localhost:5173'),
    ).toBe('http://localhost:5173/?pr=https%3A%2F%2Fgithub.com%2Fcli%2Fcli%2Fpull%2F13509');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- prUrl`
Expected: FAIL — `Failed to resolve import "./prUrl.js"` (module does not exist yet).

- [ ] **Step 4: Write the minimal implementation**

Create `extension/src/prUrl.js`:

```js
// Pure helpers for the PR Review Assistant extension. No chrome.* / fetch here
// so this module is unit-testable with vitest.

const PR_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

/**
 * Parse a browser-tab URL into PR parts, or null if it is not a GitHub PR page.
 * Matches PR sub-pages too (e.g. /files, /commits, #hash).
 * @param {unknown} url
 * @returns {{ owner: string, repo: string, number: number } | null}
 */
export function parsePrUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(PR_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** Rebuild a clean canonical PR URL from parsed parts. */
export function canonicalPrUrl({ owner, repo, number }) {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

/** Build the assistant target URL that auto-loads the PR via the app's ?pr= param. */
export function buildTargetUrl(prUrl, base = 'http://localhost:5173') {
  return `${base}/?pr=${encodeURIComponent(prUrl)}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- prUrl`
Expected: PASS (all cases in `prUrl.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add extension/src/prUrl.js extension/src/prUrl.test.ts vitest.config.ts
git commit -m "feat(extension): pure PR-URL module + tests"
```

---

## Task 3: Extension manifest, service worker, and help page

The thin `chrome.*` glue. Not unit-tested (verified manually in Task 4); all real logic lives in the tested `prUrl.js`.

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/service-worker.js`
- Create: `extension/help.html`

- [ ] **Step 1: Write the manifest**

Create `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "PR Review Assistant",
  "version": "0.1.0",
  "description": "Open the current GitHub pull request in your local PR Review Assistant.",
  "permissions": ["activeTab", "notifications"],
  "host_permissions": ["http://localhost:5173/*"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "Open in PR Review Assistant",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

Notes: no `default_popup` (so `chrome.action.onClicked` fires); `type: module` lets the worker `import` `prUrl.js`; the only host permission is `localhost` (for the health check) — there is no `github.com` permission and no content script.

- [ ] **Step 2: Write the service worker**

Create `extension/service-worker.js`:

```js
import { parsePrUrl, canonicalPrUrl, buildTargetUrl } from './src/prUrl.js';

const BASE = 'http://localhost:5173';
const HEALTH_TIMEOUT_MS = 1500;

chrome.action.onClicked.addListener(async (tab) => {
  const parsed = parsePrUrl(tab?.url);
  if (!parsed) {
    notify('Open a GitHub PR first', 'Go to a github.com pull request, then click the icon.');
    return;
  }
  const prUrl = canonicalPrUrl(parsed);
  if (await serverIsUp()) {
    chrome.tabs.create({ url: buildTargetUrl(prUrl, BASE) });
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
  }
});

async function serverIsUp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title,
    message,
  });
}
```

- [ ] **Step 3: Write the help page**

Create `extension/help.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>PR Review Assistant — server not running</title>
    <style>
      body { font: 15px/1.6 -apple-system, system-ui, sans-serif; max-width: 640px;
             margin: 64px auto; padding: 0 24px; color: #1f2328; }
      h1 { font-size: 20px; }
      code { background: #f0f1f2; padding: 2px 6px; border-radius: 6px; }
      pre { background: #f0f1f2; padding: 14px 16px; border-radius: 10px; overflow:auto; }
      .muted { color: #656d76; }
    </style>
  </head>
  <body>
    <h1>The local server isn't running</h1>
    <p>The PR Review Assistant couldn't reach <code>http://localhost:5173</code>.</p>
    <p>Start it from the project directory:</p>
    <pre>cd pr-review-assistant
npm run install-agent   # one-time: installs the always-on background server</pre>
    <p class="muted">
      Already installed? It may still be starting — wait a moment and click the
      icon again. Logs: <code>~/Library/Logs/pr-review-assistant.log</code>.
    </p>
  </body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json extension/service-worker.js extension/help.html
git commit -m "feat(extension): manifest, service worker, and offline help page"
```

---

## Task 4: Load the extension and verify the click flow (manual)

**Files:** none (browser verification of Tasks 2–3).

- [ ] **Step 1: Make sure the server is up**

Run: `npm start` (leave it running). Confirm `http://localhost:5173/api/health` returns JSON in the browser.

- [ ] **Step 2: Load the unpacked extension**

In Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder. Then click the 🧩 puzzle-piece → **pin** "PR Review Assistant" so the copper-bloom icon sits next to the address bar.

- [ ] **Step 3: Happy path**

Navigate to `https://github.com/cli/cli/pull/13509`, click the pinned icon.
Expected: a new tab opens at `localhost:5173/?pr=...` and the PR auto-loads.

- [ ] **Step 4: Not-a-PR path**

Navigate to `https://github.com/cli/cli` (repo home), click the icon.
Expected: a Chrome notification "Open a GitHub PR first" — no tab opens.

- [ ] **Step 5: Server-down path**

Stop `npm start` (Ctrl-C). On a PR page, click the icon.
Expected: a new tab opens showing `help.html` with the start command — never a broken `localhost` error page.

- [ ] **Step 6: Record outcome**

All three paths behaving as above = extension verified. If the icon does nothing, open the service-worker console via `chrome://extensions` → the extension's "service worker" link, and check for errors before proceeding.

---

## Task 5: launchd agent — plist template

**Files:**
- Create: `bin/com.prreview.agent.plist.template`

- [ ] **Step 1: Write the plist template**

Create `bin/com.prreview.agent.plist.template` (placeholders are filled in by the install script):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.prreview.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>__NODE__</string>
    <string>__ENTRY__</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>__PORT__</string>
    <key>PATH</key>
    <string>__PATH__</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>__LOG__</string>
  <key>StandardErrorPath</key>
  <string>__LOG__</string>
</dict>
</plist>
```

The `__PATH__` placeholder is critical: launchd agents start with a minimal `PATH`, but the server spawns `gh` and `claude`. The install script injects the user's full `PATH` so those CLIs are found.

- [ ] **Step 2: Commit**

```bash
git add bin/com.prreview.agent.plist.template
git commit -m "feat(agent): launchd plist template for the background server"
```

---

## Task 6: launchd agent — install/uninstall scripts and npm wiring

**Files:**
- Create: `bin/install-agent.sh`
- Create: `bin/uninstall-agent.sh`
- Modify: `package.json`

- [ ] **Step 1: Write the install script**

Create `bin/install-agent.sh`:

```bash
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

# Render the plist. Use '|' as the sed delimiter since paths contain '/'.
sed -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__ENTRY__|$ENTRY|g" \
    -e "s|__PATH__|$PATH|g" \
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
```

- [ ] **Step 2: Write the uninstall script**

Create `bin/uninstall-agent.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

LABEL="com.prreview.agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "✅ Removed $LABEL. The background server is stopped."
```

- [ ] **Step 3: Make the scripts executable and wire npm scripts**

Run: `chmod +x bin/install-agent.sh bin/uninstall-agent.sh`

In `package.json`, add to `"scripts"` (next to the existing `setup`):

```json
    "install-agent": "bash bin/install-agent.sh",
    "uninstall-agent": "bash bin/uninstall-agent.sh",
```

- [ ] **Step 4: Verify the scripts parse without executing side effects**

Run: `bash -n bin/install-agent.sh && bash -n bin/uninstall-agent.sh && echo "syntax ok"`
Expected: `syntax ok` (this checks bash syntax without running launchctl).

- [ ] **Step 5: Commit**

```bash
git add bin/install-agent.sh bin/uninstall-agent.sh package.json
git commit -m "feat(agent): install/uninstall scripts + npm wiring"
```

---

## Task 7: Verify launchd auto-start (manual)

**Files:** none (system verification of Tasks 5–6).

- [ ] **Step 1: Stop any foreground dev server**

Make sure no `npm start` / `npm run dev` is running on 5173 (avoids a port clash with the agent). The agent runs the *built* server, so the foreground watcher should be off.

- [ ] **Step 2: Install the agent**

Run: `npm run install-agent`
Expected: builds, then prints `✅ Server running at http://localhost:5173`.

- [ ] **Step 3: Confirm it's a managed, healthy process**

Run: `launchctl print "gui/$(id -u)/com.prreview.agent" | grep -E "state|pid"`
Expected: shows `state = running` and a pid.
Run: `curl -fsS http://localhost:5173/api/health` → returns JSON.

- [ ] **Step 4: Confirm survival across login**

Log out and back in (or reboot). Then run `curl -fsS http://localhost:5173/api/health`.
Expected: returns JSON without you starting anything — the agent auto-started.

- [ ] **Step 5: Confirm `gh`/`claude` are reachable from the agent**

Load a PR through the pinned extension icon and confirm the TL;DR streams (this exercises `claude`) and the diff loads (this exercises `gh`). If the diff/TL;DR error with "not found on PATH", inspect `~/Library/Logs/pr-review-assistant.log` — the injected `__PATH__` is the usual culprit.

- [ ] **Step 6: Confirm clean removal**

Run: `npm run uninstall-agent`
Then: `curl -fsS http://localhost:5173/api/health` → should now fail (server stopped), and `~/Library/LaunchAgents/com.prreview.agent.plist` should be gone.

- [ ] **Step 7: Re-install for daily use**

Run: `npm run install-agent` again (this is also the update path after `git pull`).

---

## Task 8: Document the extension + agent in the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a new section after the existing "Quick start"**

In `README.md`, immediately after the Quick start block, add:

```markdown
## Even faster: the Chrome extension (one click from any PR)

Skip the terminal entirely after a one-time setup:

1. **Install the always-on server** (one time):
   ```bash
   npm run install-agent
   ```
   This builds the app and registers a macOS launchd agent that runs the
   server in the background, restarts it if it crashes, and starts it at
   login. Remove it any time with `npm run uninstall-agent`.

2. **Load the extension** (one time): open `chrome://extensions`, enable
   **Developer mode**, click **Load unpacked**, and select the `extension/`
   folder. Click the 🧩 puzzle-piece and **pin** "PR Review Assistant".

3. **Use it:** on any GitHub PR, click the pinned copper-bloom icon. A new tab
   opens with the PR already loading.

The extension only reads the current tab's URL when you click it (`activeTab`),
talks only to `localhost`, and never touches your code or credentials — all of
that stays in the local server, exactly as before.

**After `git pull`:** re-run `npm run install-agent` to rebuild and restart the
background server with the latest code.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README section for the extension + launchd auto-start"
```

---

## Self-Review

**Spec coverage:**
- Chrome extension, MV3, `activeTab` + `localhost` only, no content script → Tasks 2–3 ✓
- Toolbar icon (no on-page button), new-tab open → Task 3 (no `default_popup`), Task 4 ✓
- Reuse existing `/api/health` → Task 3 service worker ✓
- App `?pr=` deep-link → pre-existing; confirmed in Task 1 ✓ (spec's `shared/prUrl.ts` mirror is unnecessary because the app side already parses full URLs server-side; the extension owns its own small module instead — a deliberate simplification of the spec)
- Error paths (not-a-PR, server-down) → Task 3 + Task 4 ✓
- launchd built-server agent, `RunAtLoad`/`KeepAlive`, PATH injection, logs → Tasks 5–6 ✓
- install/uninstall scripts, idempotent update path → Task 6, Task 7 Step 7 ✓
- launchd PATH gotcha + log location → Task 5, Task 7 Step 5 ✓
- Icons already generated, full bloom large / tight crop small → reused in Task 3 ✓
- Testing: pure module unit-tested, glue + launchd manually verified → Tasks 2, 4, 7 ✓
- README docs → Task 8 ✓

**Placeholder scan:** No "TBD"/"handle errors"/"similar to" — every code and command step contains the actual content. The plist `__NAME__` tokens are intentional template placeholders filled by the install script, not plan placeholders.

**Type/name consistency:** `parsePrUrl` / `canonicalPrUrl` / `buildTargetUrl` are defined in Task 2 and used with those exact names in Task 3. Label `com.prreview.agent`, port `5173`, log `~/Library/Logs/pr-review-assistant.log`, and entry `dist/server/index.js` are consistent across template, install, uninstall, and verification tasks.
