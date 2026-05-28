# PR Review Assistant

A localhost web app that makes reviewing GitHub pull requests faster by streaming AI-generated context next to a real diff viewer — so you understand what a PR does before you read a single line of code.

Runs entirely on your machine. Uses your local `gh` CLI for GitHub access and your local `claude` CLI for AI. Nothing is sent to a remote server beyond what those two tools already do.

---

## Why

GitHub's review UI gives you a flat diff and a PR description. Real reviewers want three things first:

1. **What does this PR change?** (one sentence)
2. **What used to happen vs. what happens now?** (before/after)
3. **What should I pay extra attention to?** (the actual risk)

This tool generates those automatically while you're staring at the loading spinner, then lets you review the code inside the same interface — with line comments that post back to GitHub as a real review (Approve / Comment / Request changes).

---

## What's in the box

- **Summary card** with a one-sentence headline plus an optional **Before / After** comparison
- **TL;DR tabs** — pick the depth that fits the moment:
  - 📌 Brief — concrete bullets for active review (Core change, Risk, Note)
  - 💬 Plain English — friendly two-paragraph explanation
  - ✅ Checklist — actionable items to tick off before approving
  - 🐦 Tweet — one-sentence under-280-char summary
- **Reading order** — files reordered so you read interfaces/production code before tests, with file-level noise (lockfiles, generated code) collapsed
- **Inline line comments** — hover any line, click the blue `+`, drag to extend the range. Right under the line:
  - Suggest a code change (with auto-prefilled original code)
  - **AI suggest fix** — Claude proposes a replacement based on your half-baked comment
  - **AI enhance comment** — Claude polishes your draft into a clear, specific review note
- **Submit as a GitHub review** — Approve / Comment / Request changes, multi-line ranges supported
- **Visual diagram** — Mermaid sequence/flowchart when the PR involves a flow change (silent otherwise)
- **Three code themes** — GitHub Dark, VS Code Dark+, IntelliJ Dark
- **Optional Jira context** — fetches linked tickets via REST and feeds them into AI prompts

---

## Requirements

| Tool | Why | Install |
|---|---|---|
| Node.js 18+ | Runtime | https://nodejs.org |
| `gh` CLI | Fetches the PR + diff + lets you post reviews | https://cli.github.com — then `gh auth login` |
| `claude` CLI | Generates the summaries / suggestions | https://claude.ai/code |

---

## Quickstart

```bash
git clone https://github.com/shacharPash/pr-review-assistant.git
cd pr-review-assistant
npm install
npm run dev
```

Browser opens to `http://localhost:5173`. Paste any GitHub PR URL (`https://github.com/owner/repo/pull/123` or `owner/repo#123`) and hit **Open**.

---

## Optional: Jira integration

If your PRs reference Jira tickets like `RED-12345` in the title or commits, the app can fetch them and feed the descriptions into Claude. Set these env vars before `npm run dev`:

```bash
# Link-only mode (no fetch, just clickable badges):
export JIRA_BASE_URL="https://your-org.atlassian.net"

# Full mode (also fetches title/status/description):
export JIRA_BASE_URL="https://your-org.atlassian.net"
export JIRA_EMAIL="you@your-org.com"
export JIRA_API_TOKEN="..."  # https://id.atlassian.com/manage-profile/security/api-tokens
```

If unset, the badge stays hidden and the AI just doesn't get Jira context. Nothing else changes.

---

## Using it

**Navigate files:** `j` / `k` — or click any file in the left rail. Files marked "noise" (lockfiles, `generated/`, etc.) collapse into a single row by default.

**Comment on a line:** hover any line in the diff → blue `+` appears in the gutter. Click it for a single-line comment, or **press and drag** the `+` up or down to comment on a range.

**Inside the composer:**
- `⤷ Suggest change` — inserts a ` ```suggestion ` block prefilled with the original code (GitHub renders this as a one-click apply)
- `✨ AI suggest fix` — Claude proposes a replacement; you can edit before saving
- `✨ Enhance comment` — Claude rewrites your draft to be clearer
- Adjust the line range with the `−` / `+` controls in the composer header

**Submit your review:** the blue button at the bottom of the left rail. Three options:
- ✅ Approve
- 💬 Comment (no approval, just feedback)
- 🛑 Request changes

All inline comments + an optional overall summary go to GitHub as a single review via `gh api .../reviews`.

**Resize the summary panel:** drag the handle between the TL;DR panel and the file list to give the diff more room (or click the `✕` to hide the summary entirely).

**Keyboard shortcuts:** click the `j  k  ?` badge in the header for the full list.

---

## How it works

- **Server** (`/server`): Node + Express, with Vite middleware in dev. Wraps the local `gh` and `claude` CLIs, parses unified diffs, and streams AI output over SSE.
- **Client** (`/client`): React + TypeScript + Zustand. Monaco for the diff viewer.
- **Shared types** (`/shared`).

Single command, single port, no database. PRs are cached in memory keyed by `headSha` so re-opening the same PR is instant. When the PR gets new commits, the cache invalidates naturally.

---

## Project structure

```
/server
  /services    ghFetcher, diffParser, claudeRunner, noiseRules, readingOrder,
               jira, cache, fileContent
  /routes      pr, tldr, headline, beforeAfter, diagram, explain, aiComment,
               file, review
/client
  /src
    /components   SummaryCard, TLDRPanel, FileSidebar, DiffViewer,
                  InlineCommentsLayer, ReviewFooter, etc.
    /state        store (Zustand), preferences
/shared          types, personas, jira
```

---

## Scripts

```bash
npm run dev          # Start everything (server + Vite middleware) on :5173
npm run build        # Production build of the client
npm run typecheck    # tsc --noEmit across server + client
npm test             # Run unit tests (vitest)
```

---

## License

Private repo. Reach out if you want access or want to contribute.
