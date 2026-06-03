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

After: `💬 Plain English · 🎯 Changes & Risks · ✅ Checklist · 🤖 Activity`

| Tab | Change |
| --- | --- |
| 💬 Plain English | Unchanged. Stays the default tab. |
| 🎯 Changes & Risks | Renamed from "Brief"; emoji 📌 → 🎯 (resolves the SummaryCard clash); re-rendered as a color-coded card stack. |
| ✅ Checklist | Label kept; now Jira-aware with an in-pane source note. |
| 🐦 Tweet | **Removed.** |
| 🤖 Activity | Unchanged. |

## Detailed design

### 1. Changes & Risks (was Brief)

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
  Changes & Risks generation shows the existing retry banner in that pane only;
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

## Out of scope for this change

PM view, Flow, posting back to GitHub, persistence — all unchanged from the
project's existing v1 scope.
