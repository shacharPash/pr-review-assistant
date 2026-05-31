# PR Review Assistant

A localhost web app that makes reviewing GitHub pull requests faster by streaming AI-generated context next to a real diff viewer — so you understand what a PR does before you read a single line of code.

Runs entirely on your machine. Uses your local `gh` CLI for GitHub access and your local `claude` CLI for AI. **Your code never leaves your machine** except as part of your own `claude` CLI's prompt to Anthropic, the same path you'd use directly.

![PR Review Assistant — reviewing a public PR from cli/cli](docs/screenshot.png)

*Above: reviewing [cli/cli#13509](https://github.com/cli/cli/pull/13509). Summary card with a one-sentence headline + Before / After. Left rail: TL;DR tabs + reading-ordered file list. Right pane: Monaco side-by-side diff with inline reviewer comments from Cursor BugBot, Claude Code, etc.*

---

## First run in 30 seconds

```bash
git clone https://github.com/shacharPash/pr-review-assistant.git
cd pr-review-assistant
npm start
```

`npm start` runs `bin/setup.sh` (checks tools, installs deps, copies `.env`) then `npm run dev`. Browser opens to `http://localhost:5173`. Paste any GitHub PR URL and hit **Open**.

If `gh` or `claude` aren't installed, the setup script tells you exactly what to install — and the app surfaces a friendly red banner at the top instead of crashing.

---

## What's in the box

### AI-generated context
- **Summary card** — one-sentence headline plus a **Before / After** comparison
- **TL;DR tabs** — pick the depth that fits the moment:
  - 💬 **Plain English** — friendly two-paragraph explanation (default; fastest)
  - 📌 **Brief** — concrete bullets: Core change, Risk, Note
  - ✅ **Checklist** — actionable items to tick off before approving
  - 🐦 **Tweet** — under-280-char punchline
  - 🤖 **Activity** — PR-level reviewer summaries (Claude Code, Cursor BugBot, SonarCloud, Jit, …)

Short outputs (headline, tweet, plain-english, checklist) run on Claude Sonnet for speed; the deeper Brief uses your CLI default.

### Diff experience
- **Real Monaco side-by-side diff** with syntax highlighting + three themes (GitHub Dark, VS Code Dark+, IntelliJ Dark)
- **Reading order** — files reordered so interfaces and production code come before tests; noise files (lockfiles, generated, `.idea/`) collapsed
- **Hunk-noise filtering** — imports-only and whitespace-only hunks hidden by default with a `⋯` gap marker
- **Expand context** — `↑ Expand 10` / `↓ Expand 10` chips around every hunk to reveal unchanged surrounding code without flipping to full-file mode
- **Git blame** — toggle the gutter to show the date/author/age of every line, IntelliJ-style heat coloring (recent → green, ancient → red-brown)
- **Commit selector** — GitHub-style picker: All commits / specific commit / since your last review

### Review tools
- **Reviewer & bot comments inline in the diff** — Cursor BugBot, Claude Code, Copilot, Augment, SonarCloud, Jit, etc., each color-coded by brand, foldable per card, hide-all toggle
- **Inline line comments** — hover any line, click the blue `+`, drag to extend the range. Inside the composer:
  - `⤷ Suggest change` — inserts a `​```suggestion​` block prefilled with the original code
  - `✨ AI suggest fix` — Claude proposes a replacement based on your half-baked comment
  - `✨ Enhance comment` — Claude polishes your draft into a clear, specific review note
- **Submit as a GitHub review** — Approve / Comment / Request changes, multi-line ranges supported
- **Pending comments list** — see exactly which file/line each unposted comment lives on; click to jump, ✕ to discard

### Optional
- **Jira badge + setup popover** — clickable ticket links, with full-mode fetching of title/status if you configure it
- **Per-PR localStorage** — files you marked reviewed and pending comments persist across reloads, keyed by commit SHA

---

## Requirements

| Tool | Why | Install |
|---|---|---|
| Node.js 20+ | Runtime (uses `--env-file-if-exists`) | https://nodejs.org |
| `gh` CLI | Fetches the PR + diff + lets you post reviews + lists reviewer comments | https://cli.github.com — then `gh auth login` |
| `claude` CLI | Generates the AI summaries / suggestions | https://claude.ai/code |

`npm start` checks all three and gives one-line fix hints if anything is missing.

---

## Optional: Jira integration

If your PRs reference Jira tickets like `RED-12345`, the app can render clickable badges and fetch the ticket title/status into a popover.

Copy `.env.example` to `.env` (the setup script does this for you) and fill in:

```bash
# Link-only mode — clickable badges, no ticket details
JIRA_BASE_URL=https://your-org.atlassian.net

# Full mode — also shows title/status/type in the popover
JIRA_EMAIL=you@your-org.com
JIRA_API_TOKEN=...   # https://id.atlassian.com/manage-profile/security/api-tokens
```

The `.env` is gitignored. Restart `npm run dev` after editing it.

**Note:** the Jira ticket title is fed into AI prompts as a one-line linkage hint. The full description is NOT (it was diluting prompt rules and producing meta-prose). If you want the description visible, read it in the badge popover.

---

## Using it

### Navigate files
`j` / `k` to move down/up the reading-order list, or click any file. Files tagged "noise" collapse into one row by default; click "Show N noise files" to reveal.

### Comment on a line
Hover any line in the diff → blue `+` appears in the gutter. Click for a single-line comment, or **press and drag** the `+` up or down to comment on a multi-line range.

In the composer:
- `⤷ Suggest change` — inserts a ` ​```suggestion​ ` block prefilled with the original lines
- `✨ AI suggest fix` — Claude proposes a replacement based on your draft
- `✨ Enhance comment` — Claude polishes your draft
- Adjust the line range with the `−` / `+` controls in the composer header

### See others' comments
The **🤖 Activity** tab in the TLDR panel shows PR-level reviewer summaries. Line-anchored comments from bots and humans appear **inline in the diff** as colored cards. Each card folds (`▾ / ▸`), and the diff-header `💬 Reviews N` button hides them all on the current file.

### Expand context
Each hunk has small `↑ Expand 10` / `↓ Expand 10` chips at its top and bottom. Click to splice in unchanged file context. Caps at the gap to the next/prev hunk and at file boundaries.

### Pick a commit
The **All commits ▾** dropdown in the left rail filters the diff to a single commit or to "Changes since your last review" (lights up after you've posted a review).

### Submit your review
The blue button at the bottom of the left rail. Three options:
- ✅ Approve
- 💬 Comment (no approval, just feedback)
- 🛑 Request changes

All inline comments + an optional overall summary post to GitHub as a single review via `gh api .../reviews`.

### Keyboard shortcuts
Click the `j  k  ?` badge in the header for the full list.

---

## Privacy

- **Your code never leaves your machine** as part of this app. The Express server runs on `localhost`, never opens an outbound socket except for what `gh` and `claude` already do on your behalf.
- **`gh`** uses your existing GitHub auth — same as when you run `gh` directly in a terminal.
- **`claude`** uses your existing Claude Code authentication. Prompts (which include diff content) go to Anthropic via your Claude account, the same path you'd use with `claude` directly.
- **`.env`** with Jira tokens stays on disk, gitignored. No telemetry, no usage tracking.

If you deploy this for a team behind a shared server (out of scope for v1), reassess: prompts would flow through whatever account the server runs as.

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
  /services    ghFetcher · diffParser · claudeRunner · noiseRules · readingOrder
               jira · reviewCommentsFetcher · cache · fileContent · healthCheck
  /routes      pr · tldr · headline · beforeAfter · diagram · explain · complexity
               aiComment · file · review · blame · scopedDiff · reviewComments
               · health
/client
  /src
    /components   SummaryCard · TLDRPanel · FileSidebar · DiffViewer
                  InlineCommentsLayer · ReviewCommentsLayer · ReviewActivityPane
                  CommitSelector · BlameHoverProvider · JiraBadge · HealthBanner
                  ReviewFooter · ...
    /state        store (Zustand) · preferences (Zustand + localStorage)
/shared           types · personas · jira · reviewComments
/bin              setup.sh
.github/workflows ci.yml (typecheck + test + build)
```

---

## Scripts

```bash
npm start            # Setup + dev server (one-step for first-time users)
npm run setup        # Just the checks + install + .env (no server)
npm run dev          # Server + Vite middleware on :5173 (assumes deps installed)
npm run build        # Production build of the client
npm run typecheck    # tsc --noEmit across server + client
npm test             # Run unit tests (vitest, 43 tests)
```

---

## Contributing

CI runs on every PR (typecheck + tests + build). Pure-function services have unit tests under `__tests__/` — please add one when you touch parsing or classification logic. Components are tested by hand for now.

---

## License

Private repo. Reach out if you want access or want to contribute.
