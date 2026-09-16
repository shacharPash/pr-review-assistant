# PR Review Assistant

A local, single-user GitHub PR review app. Read the code in a Monaco diff, choose a commit comparison, draft inline comments, and submit a review with your own GitHub account. Optional AI helps explain the change; the human decides what to post.

## Start locally

Use Node **22.12+ or 24**, a current browser, and the [GitHub CLI](https://cli.github.com/) authenticated with `gh auth login`. AI additionally needs a Claude Code CLI that supports `--safe-mode` and `CLAUDE_CODE_DISABLE_ATTACHMENTS` (tested with **2.1.272**), authenticated for a provider you are allowed to use.

```bash
git clone https://github.com/shacharPash/pr-review-assistant.git
cd pr-review-assistant
npm start
```

Open `http://localhost:5173` and enter a GitHub.com PR URL or `owner/repo#123`. Setup uses the lockfile and starts the production build. Missing Claude does not prevent manual code review. Core commands work on supported Node platforms; the launcher, login and background-agent helpers are macOS-only.

**AI starts off.** Open **Local data & AI** to read what will be sent and enable it for this browser. The app sends prompts through your local Claude configuration, which may route to Anthropic, Bedrock, Vertex, Foundry or a custom provider. Your provider's terms and organization policy still apply.

## What works

- Code-first side-by-side or unified diff, syntax themes, blame and surrounding context.
- Full-PR, single-commit and since-last-review comparisons. Full files use the selected comparison's revisions, including the PR merge base. Historical comparisons are read-only for posting.
- Conservative noise filtering with an explicit reveal control. Meaningful operation order and repeated operations remain visible.
- Review summaries and inline drafts are isolated by repository and PR. Confirmed submissions clear only the submitted draft values. If submission outcome is uncertain, check GitHub before acknowledging and retrying.
- Existing reviewer activity, replies and thread resolution; PR state and check status.
- Optional AI header insights, explanation, checklist, AI Review findings and Ask chat. Insight tabs start when opened; diagrams are explicitly requested. Concurrent AI processes are bounded.
- Export and delete this app's local browser data through **Local data & AI**.

## Local security boundary

The server binds only to loopback. Host and full Origin checks apply before routes; browser API requests from other sites or ports are rejected, including mixed-case API paths. There is no remote-access switch. Do not expose the server through a proxy, tunnel or container mapping.

The application uses your local account permissions. It does not isolate you from other processes running as the same operating-system user. AI runs without tools, MCP, prompt file attachments or saved sessions, from a neutral temporary working directory. User provider/privacy configuration and applicable managed policy remain in effect. Untrusted text is rendered as React content rather than interpolated HTML.

Read [SECURITY.md](SECURITY.md) for scope and reporting guidance, and [PRIVACY.md](PRIVACY.md) for recipients, retention, export and deletion limits. The maintainer does not operate a service receiving your review data.

## Chrome extension and macOS shortcuts

Run `npm run serve`, then load `extension/` as an unpacked extension from `chrome://extensions`. Pin it and click it on a GitHub PR to open that PR in the local app. It reads the active tab URL on click and probes the local health endpoint. Ordinary deep links and this health probe remain supported.

```bash
npm run make-launcher     # create a desktop .command launcher
npm run autostart-on      # open the launcher in Terminal at login
npm run autostart-off
npm run install-agent    # optional headless launchd service
npm run uninstall-agent
```

Managed accounts may require an interactive login refresh. Use the Terminal launcher if the background service cannot authenticate; the app never falls back to weaker AI isolation flags. Background logs keep two segments of at most 5 MiB under `~/Library/Logs/pr-review-assistant.log` and `.log.1`. Logger startup reduces oversized existing segments to their allowed tail and applies private file permissions. Re-run `install-agent` after updating to install the current background entry point.

## Optional Jira context

Setup creates a private, gitignored `.env` from `.env.example`. To fetch linked ticket context, set `JIRA_BASE_URL` to your Jira HTTPS origin plus `JIRA_EMAIL` and `JIRA_API_TOKEN`. Set only the base URL for clickable ticket links. Restart after changes.

At most five referenced tickets are fetched with a five second deadline. The app requests title, status, type and description, and does not request assignee/reporter names. Jira failures are shown as optional context failures. Enabling AI can send the linked ticket description to your configured AI provider for the checklist.

## Development and verification

```bash
npm ci
npm run dev              # one Express + Vite process on localhost:5173
npm run typecheck
npm test
npm run build
npm audit
```

CI checks Node 22 and 24 with read-only repository permissions and pinned actions. The tests include fake CLI processes, real temporary loopback servers, comparison identities, stale responses, review drafts, text rendering and local data controls. They do not require live GitHub mutations or model calls.

Server cache entries expire after 15 minutes, with limits of 20 PRs/50 MiB, 20 scoped comparisons/25 MiB, 100 full-file pairs/50 MiB and 100 blame results/10 MiB. Limits measure serialized cache data rather than total process memory; active requests and editor state can use additional memory. All caches are cleared on restart or through Local data & AI. Clearing also prevents requests started before deletion from caching their results. Opening a PR fetches current metadata because its description, state and review decision can change without a new commit. AI cache keys include the model and prompt version; review cache identity also hashes the actual prompt and repository conventions. Browser drafts persist until cleared; old SHA-only drafts remain available in local data export and are not automatically assigned to an unknown repository.

## Update and rollback

Stop the app before updating. In a clean checkout, record `git rev-parse HEAD`, update with `git pull --ff-only`, then run `npm ci` and `npm start`. For rollback, stop it and use a separate checkout of the recorded commit, install its lockfile and start that version. Keep uncommitted work in your development checkout; do not reset it to switch app versions. Reinstall the optional background agent for the selected checkout.

Before sharing with another developer, try a representative PR with permitted accounts and confirm the selected AI provider and model. Never distribute `.env`, local exports, credentials, logs or browser data.

## AI Review and Ask

The Insights panel includes AI Review and Ask. With AI enabled, AI Review runs when opened and suggests findings to investigate. Select All commits to stage an exactly located finding as a draft; staging never submits a review. Findings outside the added lines remain visible with an unanchored warning. An empty AI result is an assessment of the supplied context, not a human approval. Malformed or incomplete output shows a retryable error.

Re-run review bypasses the saved result. Reopening can reuse a valid result for the same PR head, selected model and prompt contents. Changing the model or included conventions creates a separate cache entry. Convention files are fetched at the reviewed head with a bounded timeout. The review prompt can omit hidden files and tests when production files are present, and long diffs can be truncated.

Ask accepts follow-up questions about the PR and can include the open file as focus. Answers use the shared safe Markdown renderer. Ask sends the conversation and selected file context along with the PR. Chat history stays in tab memory and resets on PR navigation, reload, disabling AI or clearing local data; it is not stored in the server cache or included in browser exports. Switching PRs closes the old review stream and aborts chat; late output cannot enter the new PR. An interrupted answer remains visibly incomplete. Both routes use the shared prompt-only CLI policy and its timeout and concurrency limits. The model picker selects Sonnet, Opus or Haiku explicitly; unknown selections fall back to Sonnet.

## License

Project source is [MIT](LICENSE). Dependencies keep their original licenses; see [third-party notice generation](THIRD_PARTY_NOTICES.md). The editor, workers and fonts are bundled locally. Reviewer avatars use initials; third-party bot logo images are not distributed. This project is not endorsed by its integration providers.
