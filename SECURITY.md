# Security and supported use

Run one local instance for your own account on a trusted computer. Do not expose it through a proxy, tunnel or container port mapping. The app acts with your `gh` and Claude permissions. Local processes running as you can use those permissions too; a local web boundary is not protection from a compromised operating-system account.

Untrusted PR text and AI output are data. Review suggestions before posting. No AI result establishes that a PR is safe or correct. Code review submissions use your GitHub identity and are externally visible to everyone who can read the destination repository.

Use the production build for routine reviews (`npm start`). Development mode is intended for changing the application. Keep Node, GitHub CLI, Claude CLI and browser updated. Use the locked dependency install (`npm ci`) and review Dependabot updates before merging them. Run `npm audit` when preparing a release; a clean advisory scan is only one check.

## Reporting a vulnerability

Do not include credentials, private code or customer data in public issues. If GitHub private vulnerability reporting is enabled, use **Security > Report a vulnerability** in this repository. Otherwise contact the maintainer through an existing private channel before sharing sensitive details. Public reports should use synthetic data and include the commit, local setup and reproduction steps. Do not test attacks against other people's installations or accounts.

## Before sharing a build

- Verify the loopback, rendering, comparison and review lifecycle regression tests.
- Run `npm run typecheck`, `npm test`, `npm run build` and `npm audit`.
- Test one representative PR with your own permitted accounts, including AI opt-in and a manual review preview.
- Include the generated third-party notices and the privacy documentation.
- Never include `.env`, CLI credentials, browser data, logs or downloaded draft exports.
