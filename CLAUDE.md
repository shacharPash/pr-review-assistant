# Local-First PR Review Assistant

A localhost-only web app that shortens the time to *understand* a PR so the
reviewer reads the actual code with full context — faster and with higher
quality. Java backend team is the primary audience.

## Two pillars (do not lose sight of these)

1. **Concrete TL;DR.** Not generic bullets. Must name the core change,
   the file/line location, and the main risk. Generic output = product failure.
2. **Signal vs. noise separation.** Java diffs are full of noise (imports,
   getters/setters, generated code, formatting). Noise is hidden by default;
   one click reveals it.

The code is the hero: Monaco diff viewer takes 70%+ of the screen. Everything
else is supporting chrome.

## Tech stack

- Node.js (Express) + Vite in middleware mode — single process, single port
- React + TypeScript on the frontend
- Zustand for client state
- Monaco Editor (`@monaco-editor/react`) for the diff view
- `gh` CLI for fetching PR metadata and diffs (uses the user's local auth)
- `claude-code` CLI for AI work — invoked as
  `claude -p <prompt> --output-format stream-json`, diff piped via stdin
  (or a tmp file if oversized). No direct Anthropic API key.

## Project structure

```text
/server          Express app + Vite middleware + API routes
  /services      ghFetcher, diffParser, noiseRules, readingOrder,
                 claudeRunner, cache
  /routes        /api/pr, /api/tldr/stream, /api/tldr/retry
/client          React app (Vite root)
  /components    PRInput, PRView, Header, TLDRPanel, FileSidebar, DiffViewer
  /state         Zustand store
/shared          Types shared between server and client (File, Hunk, etc.)
```

## Conventions

- **TypeScript strict mode** on both sides.
- **Service modules are pure functions where possible** — easy to unit test,
  no hidden state. The cache is the one exception and lives behind a clear
  interface.
- **Zero config principle.** Anything that would require the user to set up
  a `.env` or run a setup script needs strong justification.
- **No database, no persistence in v1.** In-memory cache only. Server restart
  = cold cache, and that's fine.
- **Diff and TL;DR are decoupled.** If `claude-code` fails or times out,
  the Monaco diff still renders. A small retry banner appears in the TLDR
  panel only. Never block the reviewer from reading the code.

## Noise detection (v1: heuristics only, no AI)

Heuristics are deterministic and instant — reviewers must trust what's hidden.

- File-level: lockfiles, `target/`, `build/`, `generated/`, `*.iml`, `.idea/`,
  pure version bumps in `pom.xml`
- Hunk-level: imports-only, whitespace-only, getter/setter-only edits
- UI: collapse in place (reviewer sees something was hidden, doesn't lose
  screen space). Global "Expand all noise" toggle for escape hatch.

AI-assisted noise filtering is explicitly deferred to post-v1.

## Caching

In-memory `Map` keyed by `${owner}/${repo}:${prNumber}:${headSha}`. When a PR
gets new commits, the `headSha` changes and the cache entry naturally
invalidates. Cache stores both the parsed diff bundle and the completed TL;DR.

## TL;DR prompt principles

The TL;DR is the single biggest risk of this product. The prompt must:

- Receive full diff + PR title + PR description + commit messages
- Forbid generic phrasing
- Require citing specific file paths and line ranges
- Require naming at least one concrete risk
- Never attempt to "approve" or "review" the code — its sole purpose is to
  onboard the human reviewer

Iterate prompts against a small set of real team PRs.

## Out of scope for v1 (do not implement)

- Posting review comments back to GitHub (reviewer uses GitHub for that)
- Mermaid diagrams by default (only render if AI explicitly opts in per PR)
- Contextual chat on selected code (planned for v1.5)
- Auth flows of any kind (relies on existing `gh` and `claude-code` auth)
- Multi-user, remote deployment, persistence

## Key commands

```bash
npm install           # install deps
npm run dev           # start dev server + open browser (single command, zero config)
npm run build         # production build (server bundles client static assets)
npm run typecheck     # tsc --noEmit on both server and client
npm test              # run unit tests (service modules)
```

## External CLI dependencies

The app assumes `gh` and `claude-code` are on the user's PATH and already
authenticated. The app does not attempt to install or authenticate them.
If either is missing, the relevant feature surfaces a clear error in the UI.

## Milestone status

- [x] M1 — Scaffold + diff in Monaco (verified end-to-end)
- [x] M2 — Noise filtering (file + hunk heuristics, toggle UI)
- [x] M3 — TL;DR streaming from claude-code over SSE
- [x] M4 — Reading order (heuristic), keyboard nav (j/k), header polish

Verified against `cli/cli#13509` (substantive Go PR) and `cli/cli#13510`
(dep bump): TL;DR cites real functions/files/lines per CLAUDE.md prompt
contract; lockfile noise correctly hidden; cache hits return in ~25ms vs
~30s cold.

## References

- `PRD.md` — original product requirements (note: superseded in places by
  the scope updates captured in this file)
