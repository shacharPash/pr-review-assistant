# One-Click PR Review — Chrome Extension + launchd Auto-Start

**Date:** 2026-06-09
**Status:** Approved (design)
**Scope:** Single-user (the author's machine). Team distribution is a deliberate follow-up spec.

## Problem

Today, reviewing a PR with the assistant takes: open a terminal → `cd` to the
repo → `npm start` → switch to the browser → copy the PR URL → paste → Open.
The author reviews PRs **browser-first** (arrives from a GitHub notification /
the PR page), so this terminal round-trip is pure friction.

There are two distinct friction points:

1. **Getting the server running** — requires a terminal and a command.
2. **Getting the PR into the app** — manual copy/paste of the URL.

## Goals

- From a GitHub PR page, **one click** opens the assistant with that PR loaded.
- The server is **always available** without the user thinking about it.
- **No new trust surface.** All privileged work (`gh`, `claude`, reading the
  diff) stays in the existing local server. Nothing new leaves the machine.
- Low build cost; low maintenance.

## Non-Goals (this spec)

- Team distribution / per-machine bootstrap (separate follow-up spec).
- An on-page injected button (rejected in favor of the toolbar icon — see
  Decisions).
- Windows/Linux server auto-start (macOS `launchd` only for now).
- Any change to the review experience itself once the app is open.

## Decisions (locked during brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Open style | **New browser tab** | Keeps the app exactly as it is; full screen for Monaco; robust. |
| Server lifecycle | **launchd auto-start (built server)** | True "never think about it"; near-zero idle CPU; one supervised process (no zombies); no new trust surface. |
| Trigger | **Pinned toolbar icon** | `activeTab` only — no standing `github.com` permission, nothing injected into GitHub pages. Lowest risk. |
| Health signal | **Reuse existing `GET /api/health`** | Already exists; a 200 response means the server is up. |

## Architecture

Three thin pieces. The existing server and app are touched only minimally.

```text
GitHub PR tab ──click──▶ Extension service worker
                          │  1. read active tab URL (activeTab, on click)
                          │  2. validate it's a PR URL
                          │  3. GET http://localhost:5173/api/health
                          ├─ 200 ─▶ open new tab: localhost:5173/?pr=<encoded>
                          └─ fail ─▶ notification + bundled help page
                                     (server not running → start command)

launchd agent ──supervises──▶ node dist/server/index.js  (built, no watcher)
```

### 1. Chrome extension — `/extension`

Manifest V3. **Permissions: `activeTab`, `notifications`. Host permissions:
`http://localhost:5173/*` only** (needed for the health fetch from the service
worker). No `github.com` host permission. No content scripts.

Files:

```text
/extension
  manifest.json
  service-worker.js        # thin chrome.* glue; calls into prUrl.js
  src/prUrl.js             # PURE, unit-tested: validate + build target URL
  help.html                # shown when the server is unreachable
  icons/  (already generated: 16/32/48/128 + 1024 master)
```

Behavior, on `chrome.action.onClicked(tab)`:

1. Parse `tab.url` via `prUrl.js`:
   - Valid PR (`https://github.com/{owner}/{repo}/pull/{number}`) → continue.
   - Not a PR → `chrome.notifications` "Open a GitHub PR first."
2. `fetch('http://localhost:5173/api/health')` with a short timeout (~1.5s):
   - 200 → `chrome.tabs.create({ url: targetUrl })` where
     `targetUrl = http://localhost:5173/?pr=<encodeURIComponent(prUrl)>`.
   - non-200 / network error / timeout → open `help.html` (bundled) in a new
     tab, explaining the server isn't running and giving the start command.

The icon set already exists in `extension/icons/` (derived from the author's
copper-bloom Octocat image): tight center crop for 16/32 so the Octocat reads
at toolbar size; full bloom for 48/128.

### 2. App deep-link — minimal client change

- On app load, read `?pr=` from the URL. If present and valid, pre-fill the
  existing PR input and auto-submit it (drives the existing fetch → diff →
  TL;DR flow). If absent, behave exactly as today.
- Parsing/validation reuses the same pure helper logic as the extension. The
  shared validation lives in `shared/` (e.g. `shared/prUrl.ts`) and the
  extension's `prUrl.js` mirrors it (extension can't import TS build output
  directly; keep the logic tiny and covered by tests on the `shared/` side).

No server change is required — `GET /api/health` already exists and returning
200 is sufficient as the "server is up" signal.

### 3. launchd auto-start agent — `/bin` + plist template

`com.prreview.agent.plist` (template, rendered at install time):

- `ProgramArguments`: `<absolute node path> <repo>/dist/server/index.js`
- `RunAtLoad: true`, `KeepAlive: true` (restart on crash, start at login)
- `EnvironmentVariables`:
  - `PORT=5173`
  - `PATH=<captured user PATH at install time>` — **critical**: launchd agents
    get a minimal environment, but the server spawns `gh` and `claude`. The
    install script captures the user's current `PATH` (including Homebrew /
    nvm / volta paths) and writes it in, so those CLIs are findable.
- `StandardOutPath` / `StandardErrorPath`:
  `~/Library/Logs/pr-review-assistant.log`

npm scripts:

- `npm run install-agent`:
  1. `npm run build` (must have `dist/`).
  2. Resolve absolute paths: repo root, `node` binary, current `PATH`.
  3. Render the plist template → `~/Library/LaunchAgents/com.prreview.agent.plist`.
  4. `launchctl bootout gui/$(id -u) <plist>` (ignore failure) then
     `launchctl bootstrap gui/$(id -u) <plist>`.
  5. Poll `GET /api/health` until 200 (or print the log path on failure).
  6. Print: "Server running at http://localhost:5173 — pin the extension icon."
- `npm run uninstall-agent`:
  `launchctl bootout gui/$(id -u) <plist>` + remove the plist file.

**Idempotent / updates:** after `git pull`, re-run `npm run install-agent` —
it rebuilds and reloads the agent. Documented in the README.

## Why this is low-risk (security)

- The extension never sees code or credentials. It learns exactly one thing —
  the URL of the active PR tab, only at the moment you click — and hands it to
  `localhost`.
- No standing `github.com` permission and no content script: nothing reads or
  modifies GitHub pages, nothing runs in the background on github.com.
- The only host permission is `http://localhost:5173/*`, used solely for the
  health check.
- The server, `gh`, and `claude` are unchanged. The trust model is identical
  to today; nothing new leaves the machine.
- launchd is a standard, supervised macOS mechanism — a single process, not a
  hand-rolled daemon, and trivially removable via `uninstall-agent`.

## Error handling

| Situation | Behavior |
|---|---|
| Active tab isn't a PR | Notification: "Open a GitHub PR first." |
| Server down/unreachable | Open bundled `help.html` with the start command — never a broken `localhost` tab. |
| launchd PATH missing `gh`/`claude` | Server logs to `~/Library/Logs/pr-review-assistant.log`; install script prints the log path; app's own health banner still surfaces missing CLIs. |
| Port 5173 already in use | Server fails to bind (logged). v1 stays on 5173; configurable port deferred (YAGNI). |
| Stale built code after `git pull` | Re-run `npm run install-agent` (rebuilds + reloads). Documented. |

## Testing

- **`shared/prUrl.ts`** (pure): vitest — valid PR URLs, non-PR github URLs,
  non-github URLs, trailing paths (`/files`, `/commits`), query/hash, and the
  `?pr=` target-URL construction + encoding round-trip.
- **App deep-link:** unit test that a valid `?pr=` triggers auto-submit and an
  absent/invalid one does not.
- **Extension glue (`service-worker.js`):** thin by design; verified manually
  (logic lives in the tested pure module).
- **launchd:** documented manual verification — install → `/api/health` 200 →
  log out/in (agent restarts) → `uninstall-agent` removes it cleanly.

## Milestones

- [ ] M1 — `shared/prUrl.ts` + tests; app reads `?pr=` and auto-submits.
- [ ] M2 — Extension (`manifest`, service worker, `prUrl.js`, `help.html`,
  wire up existing icons); manual click-through against a running server.
- [ ] M3 — launchd: plist template + `install-agent`/`uninstall-agent`;
  verify auto-start across logout/login; README section.

## Open questions / deferred

- Transparent-background icon + razor-sharp 16px vector Octocat — cosmetic
  polish, deferred.
- Team distribution (private Chrome Web Store listing vs. shared packed
  extension) + one-shot per-machine bootstrap — **separate follow-up spec.**
- Configurable port — deferred (YAGNI).
