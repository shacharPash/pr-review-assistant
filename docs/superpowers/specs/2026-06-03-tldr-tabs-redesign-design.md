# TL;DR Panel — Tab Redesign

**Date:** 2026-06-03
**Status:** Approved (design)
**Area:** `client/src/components/TLDRPanel.tsx`, `shared/personas.ts`, checklist
generation, Jira integration, `client/src/styles.css`

## Problem

The TL;DR panel's tab bar is the reviewer's first read of a PR, but three of
its five tabs underperform:

- **Brief** is the product's pillar #1 ("concrete TL;DR": name the core change,
  the file/line, the main risk) yet it reads poorly — a flat list with cryptic
  `★ / ! / ·` icons — and the name "Brief" tells the reviewer nothing. Its 📌
  icon also collides with the top `SummaryCard` (also 📌), so two different
  things look like the same thing.
- **Tweet** duplicates the top `SummaryCard` headline. A 280-character one-liner
  does not help someone *review code*.
- **Checklist** invents generic "things to verify" with no grounding in what the
  ticket actually asked for.

The panel is supporting chrome — the Monaco diff is the hero at 70%+ of the
screen. The goal is fewer, sharper tabs that get the reviewer into the code
faster, not more surface area.

## Goals

1. Make the concrete-summary tab actually readable and clearly named.
2. Ground the checklist in the linked Jira ticket when one is available.
3. Remove dead weight (Tweet).
4. Keep the bar lean — 4 tabs, no sprawl.

## Non-goals (explicitly deferred)

- **"PM view" lens** — serves a non-reviewer audience; out of scope for a
  reviewer's localhost tool. Revisit as a follow-up; if ever added, place behind
  a "+ lens" switcher rather than a permanent tab.
- **"Flow" lens** — diagram capability already exists via `DiagramPanel`
  (AI opt-in per PR). Not worth a permanent tab slot now.
- No change to Plain English or Activity tabs.

## Final tab set

Before: `💬 Plain English · 📌 Brief · ✅ Checklist · 🐦 Tweet · 🤖 Activity`

After: `💬 Plain English · 🎯 Key Points · ✅ Checklist · 🤖 Activity`

| Tab | Change |
| --- | --- |
| 💬 Plain English | Unchanged. Stays the default tab. |
| 🎯 Key Points | Renamed from "Brief"; emoji 📌 → 🎯 (resolves the SummaryCard clash); re-rendered as a color-coded card stack. (First named "Changes & Risks", then "Key Points" — not every PR has a risk, so "& Risks" over-promised.) |
| ✅ Checklist | Label kept; now Jira-aware with an in-pane source note. |
| 🐦 Tweet | **Removed.** |
| 🤖 Activity | Unchanged. |

## Detailed design

### 1. Key Points (was Brief)

Same parsed content (`parseBullets` → `core | risk | note`), new presentation.
Replace the flat `tldr-bullet` rows with a **card stack**: one card per insight,
a 3px colored left border by kind, a small uppercase tag, and the `file:line`
citation pinned to the top-right as a code chip.

- `core` → blue (`#388bfd`), tag "Core change"
- `risk` → amber (`#f0883e`), tag "⚠ Risk"
- `note` → gray (`#6e7681`), tag "Context"

The `file:line` chip is the payoff of this pane (it's what sends the reviewer to
the right place), so it must be visually prominent, not buried in prose.

**Touch points:**

- `TLDRPanel.tsx`: rename the tab (`label: 'Changes & Risks'`, `emoji: '🎯'`,
  `id` stays `'brief'` to avoid churn in the store/stream wiring). Rework
  `BriefTab`'s `done` branch to render cards instead of flat bullets. The
  existing `KIND_LABEL` / `KIND_TITLE` maps are replaced by per-kind tag text
  and colors.
- `styles.css`: add card-stack styles; the old `.tldr-bullet` rules can be
  removed once nothing references them.
- The collapsed pill and any other 📌-for-Brief references update to 🎯.

No change to parsing, streaming, caching, or the TL;DR prompt.

### 2. Checklist — Jira-aware

Keep the **Checklist** label and emoji (✅). Add a **source note** at the top of
the pane that tells the reviewer where the items came from, and choose the
generation prompt accordingly.

Three runtime states collapse into two rendered modes:

| Jira state | Mode | Source note |
| --- | --- | --- |
| Full Jira (`isJiraConfigured()` true **and** ticket fetched with a non-empty `description`) | **Ticket AC** | Blue note + Jira chevron logo: "Acceptance criteria from `RED-XXXX`" + "open ticket →" link to `ticket.url` |
| Link-only (base URL only, no token) **or** no Jira **or** no ticket detected | **AI-generated** | Neutral note: "✨ AI-generated from the diff — verify before approving" |

Link-only collapses into AI-generated because we cannot read the ticket body
without full auth, so there are no acceptance criteria to ground on.

**Generation (server):** the checklist persona prompt is selected at request
time:

- **Ticket AC prompt** (new): given the ticket `description` (already flattened
  to plain text by `adfToPlainText` in `server/services/jira.ts`) plus the diff,
  derive checklist items from the ticket's acceptance criteria / Definition of
  Done, each phrased as a verification the reviewer can tick, and note where an
  item appears **unmet** by the diff.
- **AI verification prompt** (existing `checklist` persona in `shared/personas.ts`):
  unchanged; used when there is no ticket text to ground on.

The ticket text and the chosen mode travel with the checklist generation
request. The first fetched ticket with a non-empty description is the grounding
source (multi-ticket PRs use the first; matches existing `JiraBadge` "first +N"
behavior).

**Rendering (client):** `PersonaPaneChecklist` reads `bundle.jira` (already in
the store) to decide which source note to render:

- `bundle.jira.configured === true` and `tickets[0]?.description` non-empty →
  Jira note (logo + key + `tickets[0].url`).
- otherwise → AI-generated note.

Reuse the existing `JiraIcon` SVG from `JiraBadge.tsx` (extract it to a small
shared component or duplicate the 3-path SVG — extract preferred so the two
call sites stay in sync). Checkbox interaction and `parseChecklistItems` are
unchanged.

**Cross-link:** when an AC item is unmet, it may link to the Changes & Risks
tab (e.g. via `selectTab('brief')`) so the reviewer jumps to the relevant risk.
Nice-to-have, not required for the first cut.

### 3. Remove Tweet

- `shared/personas.ts`: remove the `tweet` persona and drop `'tweet'` from
  `PersonaId`.
- `TLDRPanel.tsx`: remove the Tweet tab entry, `PersonaPaneTweet`, the
  `activeTab === 'tweet'` branch, and the warm-up line `selectTab('tweet')`.
- `state` / `personaResults`: remove the `tweet` slot.
- `styles.css`: remove `.tweet*` rules.
- Verify the server persona route and any `findPersona('tweet')` callers are
  removed so a stale id can't be requested.

## Data flow (Checklist, Jira mode)

```
gh PR fetch ──▶ detectJiraKeys() ──▶ fetchTickets() ──▶ bundle.jira
                                                            │
                          full-auth + ticket.description ?  │
                                       ┌────────────────────┴────────────┐
                                  yes  │                                  │ no
                                       ▼                                  ▼
                       checklist gen: Ticket-AC prompt        checklist gen: AI prompt
                       (ticket text + diff)                   (diff only, existing)
                                       │                                  │
                                       ▼                                  ▼
                       client: Jira source note               client: AI source note
                       (logo + key + open link)               (✨ verify before approving)
```

## Error handling / fallbacks

- The Diff ↔ TL;DR decoupling is preserved: any failure in checklist or
  Key Points generation shows the existing retry banner in that pane only;
  the Monaco diff still renders.
- Jira fetch failure or missing description → silently fall back to the
  AI-generated checklist (no error surfaced; the source note simply reads
  "AI-generated"). Matches the "Jira is optional, zero-config" principle.

## Testing

- `shared/__tests__`: persona list no longer exports `tweet`; `PersonaId` type
  excludes it (compile-time check).
- Checklist source selection: unit-test the predicate that picks Jira vs AI mode
  given `bundle.jira` shapes (configured+desc, configured+no-desc, link-only,
  none).
- `parseChecklistItems` / `parseBullets` unchanged — existing tests stay green.
- Manual verification against a PR with a linked Jira ticket (full auth) and one
  without, plus a link-only configuration, confirming the correct source note
  and item grounding. Re-verify the existing `cli/cli#13509` / `#13510` cases
  still render (these have no Jira → AI-generated path).

## Addendum — Layout & readability (v2, from live feedback)

After running the tabs against real PRs, a second round of feedback drove
layout and readability changes:

1. **Rename → Key Points** (see tab table above).
2. **Calmer code identifiers.** Inline `code` in all AI panes (Plain English,
   Key Points, Checklist, Summary, Before/After) was a saturated-blue bordered
   chip on every identifier — "blue confetti" that broke sentence flow. Replaced
   with a single shared treatment: warm amber (`--ident: #e3a857`) text in a
   hairline transparent chip. Body text was already `--fg` (#e6edf3); the
   problem was the chips, not the prose.
3. **Checklist Jira-note contrast.** The "from Jira" note rendered accent-blue
   text on an accent-blue tint (unreadable). Fixed: bright `--fg` text, the
   ticket key + "open ticket" link in `--info`.
4. **Layout: Summary moves into the left rail.** The full-width Summary band at
   the top was dropped. `SummaryCard` now sits at the **top of the left rail**
   (Summary + Before/After → TL;DR tabs → file list), and the diff column starts
   at the very top of the work area, full height. Consequences:
   - The reading-line-length problem is solved structurally: the ~420px rail
     caps line length far better than the old full-width band (which produced
     150+ char lines on wide monitors). A `max-width: 62ch` guards wide rails.
   - The Summary's review-effort pill stacks **below** the text in the narrow
     rail (was to the right in the full-width band).
   - `.app` grid rows drop from `52px auto auto auto 1fr` to `52px auto 1fr`.
   - The Summary headline + Before/After now render `` `inline code` `` as amber
     chips (previously shown as literal backticks).
   - `SummaryResizer` component and the `summaryHeight` preference are removed —
     the card is content-height in the rail (capped at 42% of rail height,
     scrolls internally if needed).
5. **Focus mode — dropped.** Originally planned (collapse AI chrome to maximize
   the code). The new layout makes it largely redundant: the diff already owns
   the right side at full height, and the existing rail resizer + TL;DR collapse
   pill already let the reviewer reclaim width. Revisit only if reviewers ask
   for a one-click collapse.

## Out of scope for this change

PM view, Flow, Focus mode, posting back to GitHub, persistence — all unchanged
from the project's existing v1 scope.
