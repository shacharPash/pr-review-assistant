# Local data and privacy

This describes the local application, not a hosted service. The maintainer does not receive your PRs, credentials, reviews or usage through an application backend. The app has no analytics SDK, advertising cookies or maintainer-operated telemetry endpoint.

## Data flow

| Data | Purpose and destination | Retention |
| --- | --- | --- |
| GitHub PR metadata, code, commit messages, author names, review comments and checks | Read with your existing local `gh` account; displayed in your browser | Server memory cache: at most 20 PR entries, a 50 MiB budget, plus 20 scoped comparisons (25 MiB), 100 full-file pairs (50 MiB), and 100 blame results (10 MiB); all have a 15 minute absolute lifetime, cleaned at least once a minute; discarded on restart |
| Draft reviews, reviewed files and last-reviewed revisions | Saved in this browser's local storage under `pra.*` | Until you clear them; submitted draft values are removed after confirmed success |
| Theme, panel sizes, AI preference and model choice | Browser local storage under `pra.*` | Until you change or clear them |
| PR URLs | Browser address bar for refresh/deep links | Browser history and browser backups follow your browser settings |
| Linked Jira ticket keys, titles, status, type and description, when configured | Direct HTTPS requests to your configured Jira server, up to five tickets with a five second timeout | Included in the PR memory cache; assignee and reporter names are not requested |
| AI input and output, only when you enable AI | PR code and metadata, and optional Jira context, sent by your local Claude CLI using its configured provider and account | Provider retention depends on that account, contract and settings; completed output is cached in process memory |
| Credentials | `gh` and Claude keep their own authentication; optional Jira credentials are in your local `.env` | Managed by you and the CLIs; excluded from Git and browser exports |
| Logs | Startup and operational diagnostics in your terminal; the optional macOS background agent also writes a local log | Terminal retention depends on the terminal; background logs keep two segments of at most 5 MiB each (with permissions limited to the local user); oversized existing segments are reduced to their allowed tail on logger startup; see cleanup below |

The editor, workers and fonts are served locally. The app does not fetch remote avatar images. Opening an external link deliberately connects your browser to the linked service.

## AI choice

AI is off until you enable it in **Local data & AI**. The disclosure covers sending repository content and optional Jira descriptions to the provider configured in Claude. Enabling AI is a browser preference; turn it off in the same control. The diff and manual review workflow work without AI.

Claude runs as a prompt-only subprocess, with tools and MCP disabled and session persistence disabled. The app preserves provider/authentication and privacy settings needed by your account. Organization-managed CLI policy can still apply. This is not a promise about the provider's training, logging, regional routing or retention. Check your actual account settings and agreement before using work repositories. A user-supplied custom provider endpoint is also a recipient.

## Access, export, correction and deletion

Use **Local data & AI** to export saved application data as JSON or clear this app's browser data and server cache. The export may contain private draft text and repository references. Keep it private. Clear affects `pra.*` keys only and does not touch other applications sharing localhost.

Cache budgets measure serialized data, not total process memory. Active requests and the editor can temporarily use additional memory. Clearing empties all server caches and prevents requests started before clear from caching their results; it does not cancel external reads already in progress. Close other app tabs before clearing to prevent new requests from loading data again.

Edit a pending draft in its composer. Submitted reviews are stored on GitHub and must be edited or deleted there. Clearing the app does not delete GitHub or Jira source records, your browser history, downloaded exports, terminal output, operating-system backups or provider-side records.

To remove the optional background-agent log, stop it with `npm run uninstall-agent` and delete `~/Library/Logs/pr-review-assistant.log` and its `.1` rotation if present. To remove Jira credentials, delete the values from your `.env` and revoke the token at Jira. Manage GitHub and Claude login/revocation using those CLIs. Check Time Machine or other backups separately; the app does not control backup retention or encrypt local storage.

## Use in an organization

The intended audience is developers running the tool locally, initially in Israel. Local execution does not remove confidentiality duties or privacy obligations attached to the source data. The person or organization deciding to process personal data must determine their own obligations, permitted recipients and retention. The maintainer's role can change if support starts collecting logs, a hosted service is introduced, or telemetry is added.

Before processing work code, confirm permission to disclose it and any personal data to GitHub, Jira and the selected AI provider. Where required, review provider processing terms, international transfers and deletion rights with the responsible organization. This repository does not establish legal compliance or determine whether a particular Israeli, EU or other legal requirement applies to you. No feature is intended to collect information about children; avoid putting unnecessary personal or sensitive data into prompts or issue reports.

Provider references: [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Claude Code data usage](https://code.claude.com/docs/en/data-usage), [Atlassian privacy policy](https://www.atlassian.com/legal/privacy-policy). Israeli operators can consult the [Privacy Protection Authority](https://www.gov.il/en/departments/the_privacy_protection_authority/govil-landing-page) and their organization's privacy contact.
