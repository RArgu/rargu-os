# 006: Data demos (Focused Web Crawler, Insider Trading)

**Status:** Archived 2026-10-24 (spec 007 T7; living docs updated); was Verified (local) 2026-10-23 (T1–T7, branch `spec-006-demos`); Approved · **Owner approval:** 2026-10-22 · **Gates needed:** none
**Related:** spec 001 (windows, reduced motion, R18 contrast, budget); mock v0.6
(`docs/mockups/rargu-os-src/reused.js`, `part1.html`); OWNER_QUESTIONS 2026-10-22 (dummy data; demo style as in
the mock; real tools later; fix weak contrast pairs); `content/projects/focused-web-crawler.md`,
`content/projects/polymarket-insider-trading.md`; critique `docs/review/spec-006-critique-codex.md` (10 findings,
all accepted).

## Why

Two projects are data pipelines. The owner wants each window to show the idea working, as in the mock, with dummy
data for now. Separate later work will make them real (crawler with a visitor-chosen cheap model and a downloadable
result; insider check on any Polymarket market by ID).

## Assumptions

1. The mock's demos are the approved behaviour (owner, 2026-10-22). Their data is invented and stays labelled.
2. The real tools will replace these demos later, so each demo reads its data from one module. [Prop]
3. Mock defects to fix (Codex 006): rejected crawler rows at `opacity: .45` measure 2.63:1 light and 3.75:1 dark
   (`part1.html:149`); the pause button keeps `aria-label="Pause"` when it shows Play (`part1.html:291`); Replay keeps
   old wallet callbacks (`reused.js:103`); the crawler interval never stops (`reused.js:80`). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Crawler: four columns (URL keywords, static similarity, adaptive similarity, LLM judge) stream simulated pages (✓/✗, score, host/path). Each column keeps at most 14 rows and shows precision = relevant ÷ processed pages for that strategy. The footer shows the sum of processed pages. A Pause/Resume button. | [Prop] | unit + e2e | — |
| R2 | Insider: an invented market's price chart draws over time, marks a spike, and dots trades by size (amount in $k). A trade is flagged when its size ≥ 20 ($k) and it falls in the 14 hours before the spike; the list shows each flagged trade's wallet id, amount and hours before = spike hour − trade hour. A Replay button. | [Prop] | unit + e2e | — |
| R3 | Each window shows, without scrolling: "Simulated demo. The interactive tool is planned and is not available here." The insider window also says it flags candidates and does not prove insider trading. No real wallet, market or URL is presented as real data. | [Prop] | e2e | — |
| R4 | Data comes from seeded generators, one module per demo. The same seed gives the same data. | [Prop] | unit | — |
| R5 | At rest each window already shows content (crawler rows; full chart and list). Animation starts when the window first becomes visible (current rectangle at current zoom overlaps the view), stops while off screen or in a hidden tab, and resumes from the same state; a visitor's Pause stays. | [Prop] | e2e | — |
| R6 | Replay and unmount cancel every pending callback of the previous run. | [Prop] | e2e | — |
| R7 | Reduced motion, at start, after Replay and on a live change: full rows, full chart, flagged list and footer at the next frame; no streaming. | [Prop] | e2e | — |
| R8 | Contrast: every text, including rejected rows (keep ✗ and strike-through, no opacity below 4.5:1) and canvas text, meets 001 R18 in both themes, also after a live theme change. | [Prop] | unit + e2e | — |
| R9 | Accessibility: native buttons whose names match their action (Pause / Resume / Replay); a text summary of the chart (spike hour, price change, flagged count) next to the canvas; Enter and Space work without dragging the window. | [Prop] | e2e | — |
| R10 | The chart draws in logical sheet px; its backing store follows device pixel ratio without changing geometry; a resize keeps the playback state. | [Prop] | e2e | — |
| R11 | No network request from either demo, including after Pause/Resume and Replay. | [Prop] | e2e | — |
| R12 | Both windows match mock v0.6 in these views: each window centred at 1440 × 900 and 390 × 844, light and dark; crawler paused; chart complete; Replay before the spike (time and seed frozen). Allowed differences only: seeded data, the R3 wording, contrast fixes, accessibility text, motion behaviour. | [Prop] | compare-vs-mock | — |

### Acceptance

- **R1.a** Given a fixture stream (seed S) of 10 pages per column with known ✓/✗, then each column's precision equals
  the expected value exactly and the footer equals 40. After 200 steps, each column has 14 rows and the counters
  still match the fixture totals.
- **R1.b** Given Pause, then no rows appear for 2 s; given Resume, then rows resume.
- **R2.a** Given seed S, then the flagged list equals the fixture's expected trades (wallet, amount, hours before) and
  each listed trade has a highlighted dot at its hour on the chart.
- **R3.a** Given both windows at 1440 × 900 and 390 × 844, then the R3 sentences are visible without scrolling the
  window.
- **R4.a** Same seed twice → equal output; another seed → different output.
- **R5.a** Given the window off screen for 2 s or the tab hidden, then callback counts do not change; after return,
  they advance from the same state.
- **R6.a** Given Replay pressed right after the first flagged wallet appears, then no old entry returns before the new
  spike.
- **R7.a** Given reduced motion, then each window's rows, chart and list are complete at the next frame, also after
  Replay and after the preference turns on mid-run.
- **R8.a** A unit test computes composited contrast for the row styles (✓ and ✗) and the chart text in both themes
  and fails below the limits.
- **R9.a** Given focus on Pause, when Space is pressed, then the button reads "Resume", focus stays, the window does
  not move; the chart summary text is present.
- **R10.a** Given DPR 1 and 2, then the chart's logical geometry (axis positions in CSS px) is equal.
- **R11.a** Given request logging from navigation, through playback, Pause/Resume and Replay to completion, then no
  request beyond the page's own build assets.
- **R12.a** compare-vs-mock pass for the R12 views lists only the allowed differences.

## Approach

- `src/sheet/demos/crawler.ts`, `insider.ts` (`mount(el)` / `unmount()`), data in `crawler-data.ts` and
  `insider-data.ts` (seeded generators, the mock's host/path lists, invented wallet ids), and the visibility helper
  shared with 005. Port from `reused.js` with the fixes of assumption 3.
- **Rejected:** real data now (owner: dummy for now); a video (no theme support, heavier).

## Boundaries

- **Always:** label the data as simulated and the insider result as candidates only.
- **Never:** present invented data as real; call a crawler, Polymarket, GDELT or LLM API (later work, G-net).

## Out of scope

- The real crawler and the real Polymarket check (later specs, G-net).

## Open questions

- None. The flag rule (≥ 20 $k within 14 h before the spike) follows the mock's generator and is a [Prop]; the owner
  can change it at review.

## Approval record

2026-10-22 — Owner approved this spec as written ("Approve all", together with 001 Amendment 1 and specs 002–007),
including the proposals named in it. No gate is approved by this.

## Lead decisions (overnight run)

2026-10-23 — T3/T4 (Codex 006 T3/T4 #2): the crawler lists (178 px) and the insider cards keep the mock's inner
sizes; the windows grow instead (crawler h 522, insider h 551; 001 layout table updated, as 001 Approach allows).
Follows the 005 Pentimento advisor decision. No requirement text changed. Owner to confirm.
