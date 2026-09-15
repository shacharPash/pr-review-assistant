# PR Review Assistant

A localhost web app that helps you understand a GitHub pull request *fast* — a concrete TL;DR and a real diff viewer, side by side — before you read a line of code.

Runs entirely on your machine: your local `gh` CLI for GitHub, your local `claude` CLI for AI. **No API keys, no telemetry.** Your code only goes where your own `claude` CLI already sends it.

![PR Review Assistant reviewing a real PR](docs/screenshot.png)

---

## Quick start

```bash
git clone https://github.com/shacharPash/pr-review-assistant.git && cd pr-review-assistant && npm start
```

`npm start` checks your tools, installs deps, then opens `http://localhost:5173`. Paste any GitHub PR URL and hit **Open**. Already cloned it? Just `git pull && npm start`.

*(Missing `gh` or `claude`? The setup script and a banner in the app tell you exactly what to install — the diff still works without AI.)*

---

## One click from any PR: the Chrome extension

1. **Start the server** (leave it running while you review):
   ```bash
   npm run serve
   ```
   Keeping it in your own terminal matters: the spawned `claude` shares your
   interactive session, so its login refreshes automatically.

   **Tip — skip the terminal:** run `npm run make-launcher` once to drop a
   double-clickable **"PR Review Assistant.command"** on your Desktop. Drag it
   into the Dock; from then on a double-click starts the server (no `cd`, no
   typing). Close the window to stop.

   **Tip — never start it yourself:** after creating the launcher, run
   `npm run autostart-on` once. It opens the launcher at every login (in
   Terminal, so Claude auth still works), so the server is always up and the
   extension just works. Disable with `npm run autostart-off`. A Terminal
   window opens at login — minimize it and leave it running.

2. **Load the extension** (one time): open `chrome://extensions`, enable
   **Developer mode**, click **Load unpacked**, and select the `extension/`
   folder. Click the 🧩 puzzle-piece and **pin** "PR Review Assistant".

3. **Use it:** on any GitHub PR, click the pinned copper-bloom icon. A new tab
   opens with the PR already loading. (Off a PR, it opens the app's landing
   page.)

The extension only reads the current tab's URL when you click it (`activeTab`),
talks only to `localhost`, and never touches your code or credentials — all of
that stays in the local server.

### Optional: always-on background server

```bash
npm run install-agent     # macOS launchd; npm run uninstall-agent to remove
```
Runs the server in the background and starts it at login, so you never start it
manually. **Caveat:** if your Claude is **org-managed** (enterprise), a headless
background process can't refresh the login, so you'd have to `claude auth login`
repeatedly — use `npm run serve` instead. The agent is ideal for **personal**
Claude accounts. After `git pull`, re-run `npm run install-agent` to rebuild.

---

## What you get

**Understand the PR** — a left panel with everything you need to get oriented:
- **Summary** — one-sentence headline + a **Before / After** comparison
- **🎯 Key Points** — concrete cards naming the *core change*, the *main risk*, and *context* (per file/line)
- **💬 Plain English** — a friendly two-paragraph explanation
- **✅ Checklist** — things to verify before approving; built from the linked **Jira ticket's acceptance criteria** when there is one, otherwise AI-generated
- **🤖 Activity** — summaries from other reviewers/bots (Claude Code, Cursor BugBot, SonarCloud, …)
- A **PR status badge** in the header (Draft / Open / Merged / Closed) + the review decision
- Collapse any panel to give the **code the full screen**

**Read the code** — a real Monaco side-by-side diff:
- Syntax highlighting + 3 themes; **git blame** gutter with age coloring
- **Signal over noise** — files reading-ordered (code before tests); lockfiles/generated/imports-only hunks hidden by default
- **Expand context** around any hunk without opening the whole file
- **Commit selector** — all commits, one commit, or "since my last review"

**Review** (open PRs only):
- Inline line comments — with **✨ AI suggest-fix** and **✨ enhance-comment** helpers
- Submit as a GitHub review (Approve / Comment / Request changes). On merged/closed PRs the review actions are replaced with a status note — no false "Ready to approve".

**Speed/cost** — a **Fast / Smart** toggle (Sonnet everywhere vs. Opus where reasoning helps) and a per-session token-usage badge.

---

## Requirements

| Tool | Why | Install |
|---|---|---|
| Node.js 20+ | Runtime | https://nodejs.org |
| `gh` CLI | Fetch the PR/diff, post reviews | https://cli.github.com → `gh auth login` |
| `claude` CLI | AI summaries & suggestions | https://claude.ai/code |

`npm start` verifies all three and prints fix hints if any are missing.

---

## Optional: Jira

If your PRs reference tickets like `RED-12345`, copy `.env.example` to `.env` (the setup script does this) and add:

```bash
JIRA_BASE_URL=https://your-org.atlassian.net   # clickable ticket badges
JIRA_EMAIL=you@your-org.com                     # + fetch title/status and
JIRA_API_TOKEN=...                              #   power the Jira-aware Checklist
```

The `.env` is gitignored. Restart after editing.

---

## How it works

- **Server** (`/server`) — Node + Express (Vite middleware in dev). Wraps the `gh` and `claude` CLIs, parses diffs, streams AI output over SSE.
- **Client** (`/client`) — React + TypeScript + Zustand; Monaco for the diff.
- **Shared types** (`/shared`).

Single command, single port, no database. PRs are cached in memory by commit SHA, so re-opening one is instant and new commits invalidate it automatically.

---

## Scripts

```bash
npm start        # setup + dev server (first-time friendly)
npm run dev      # dev server on :5173 (deps already installed)
npm run build    # production build
npm run typecheck
npm test         # unit tests (vitest)
```

---

## Privacy

The server runs on `localhost` and opens no outbound connections beyond what `gh` and `claude` already do for you. `gh` uses your existing GitHub auth; `claude` sends prompts (including diff content) through your own Claude account — the same path as running `claude` yourself. No telemetry.

---

## License

MIT — see [LICENSE](LICENSE). Issues and PRs welcome.


### AI Review and Ask

The Insights panel includes AI Review and Ask. AI Review runs when opened and suggests findings to investigate. Select All commits to stage an exactly located finding as a draft; staging never submits a review. Findings outside the added lines remain visible with an unanchored warning. An empty AI result is an assessment of the supplied context, not a human approval. Malformed or incomplete output shows a retryable error.

Re-run review bypasses the saved result. Reopening can reuse a valid result for the same PR head, selected model and prompt contents. Changing the model or included conventions creates a separate cache entry. Convention files are fetched at the reviewed head with a bounded timeout. The review prompt can omit hidden files and tests when production files are present, and long diffs can be truncated.

Ask accepts follow-up questions about the PR and can include the open file as focus. Answers use the shared safe Markdown renderer. Chat history stays in memory and resets on PR navigation. Switching PRs closes the old review stream and aborts chat; late output cannot enter the new PR. An interrupted answer remains visibly incomplete. Both routes use the shared prompt-only CLI policy and its timeout and concurrency limits. The model picker selects Sonnet, Opus or Haiku explicitly; unknown selections fall back to Sonnet.
