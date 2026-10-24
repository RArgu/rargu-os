# Spec 006: mock vs build (compare-vs-mock)

Shot by a subagent with Playwright (T6); the lead agent classified the list.

Shot by a subagent with Playwright (T6, R12). Draft for the lead agent; nothing fixed.

## Pass 1 — 2026-10-23

### What was compared

- Mock: `docs/mockups/rargu-os-v0.6.html`, SHA-256
  `059b7b873f1e1173126f8b540e51d562555532800c06991affc0f87d117177ed` (observed: `shasum -a 256`; matches
  `docs/mockups/README.md`).
- Build: `npm run build && npx vite preview --port 4336 --strictPort`, `/next`, commit `d39fdb4`. `src/` clean
  (observed: `git status --short` shows only test files modified and two untracked files, none of them in the build:
  `tests/e2e/compact-demos.spec.ts`, `tests/e2e/insider.spec.ts`, `tests/unit/demo-contrast.test.ts`,
  `docs/review/spec-006-impl-review-codex.md`, `tests/e2e/zz-debug-compact.spec.ts`; not made by this task).
  Build log: `sheet-guard: "next" JS + CSS 16.8 KiB gzip (2 chunks, 1 css, budget 100 KiB)`.
- Browser: Playwright 1.63.0 Chromium, device scale 2.
- Viewports and themes: 1440 × 900 and 390 × 844, light and dark. Phone: build with `isMobile` + touch; mock with
  touch only, as in 001 and 005.
- Centring: the card's project link `[data-go="crawler"]` / `[data-go="insider"]`; on phone the card toggle first
  (mock `#railToggle`, build `.railtoggle`). Settle = window transforms, scroll and zoom unchanged for 400 ms.
  - **Mock phone, extra step (mock only):** the mock's link handler calls `panTo()` before `closeRail()`
    (`docs/mockups/rargu-os-src/part2.js:145`), so `visibleArea()` still counts the open card and the window lands
    under it (observed: window top y 668, bottom off screen). After the click, the script runs
    `closeRail(); panTo(id)` (the same functions). Result: window at x 16, y 147 (crawler) / 140 (insider).
  - Mock buttons (`#crPause`, `#inReplay`) were pressed with `dispatchEvent("click")`: on a phone they sit off
    screen and a Playwright click would scroll the sheet to them.
- States and how each was frozen:
  - **Crawler paused:** build `.cr-pause` click (label then "Resume"); mock `#crPause` (label stays "Pause", mock
    defect fixed by R9). Check: window screenshots 1.5 s apart identical in all 8 runs (`crawlerFrozen: true` in
    `mock/log.json`, `build/log.json`).
  - **Insider chart complete:** waited for the footer "t = 159h of 160h" and every flagged entry shown (build 4,
    mock 3) + 500 ms. Both played on first view in all 8 runs (`insiderPlayedOnShow: true`); no Replay needed.
  - **Insider Replay before the spike, frozen at hour 110** (spike at 118):
    - Build: `page.clock.install()` before load (time flows), after centring `page.clock.pauseAt(now + 100 ms)`,
      a `page.mouse.click` on Replay, then `page.clock.runFor(2200)` (20 ms per hour, `insider.ts` `HOUR`).
      Footer "t = 110h of 160h" in all four runs.
    - Mock (page script, mock only; the file was not edited): an init script wraps `requestAnimationFrame` and drops
      each callback once the mock's `inT` ≥ `window.__stopAt`; `__stopAt = 110` set just before Replay. `inT` steps
      by 0.9 (`reused.js` `inPlay`), so it stops at 110.7 → drawn hour 110. Footer "t = 110h of 160h" in all four
      runs. **Exact match of the hour** (both draw hours 0–110).
    - Check: window screenshots before and after a wait identical (`replayFrozen: true`, 8 runs; build checked under
      the paused clock).
  - Seed: the build's insider seed is fixed (`SEED`); the mock's insider uses its own seed 7; the mock's crawler
    uses `Math.random` (not seeded), the build's crawler stream is seeded. Data differs by design.
- Crops: window rectangle + 16 px margin, clipped to the viewport. One full view per viewport/theme for each window
  (`*-full-crawler.png`, `*-full-insider.png`).
- Scripts: scratchpad `t6-006/shoot.mjs` (shots, logs and DOM measurements → `mock/log.json`, `build/log.json`),
  summary `t6-006/measure.txt`.
- Images: scratchpad `t6-006/mock/`, `t6-006/build/`, `t6-006/pairs/` (20 pairs, `pair.py`: mock left, build
  right).

### Differences

| ID | View | Difference | Reason |
|---|---|---|---|
| **D1** | 390 × 844, both windows, all states | Window 680 px at the 58 % phone zoom is 392.65 px wide; at x 16 its right edge is at 408.65 (screen 390). The Home ⌂ button (x ≈ 393) is off screen, Pause/Replay is cut at the edge, the LLM judge column and the footer's right text ("✓ relevant · ✗ rejec…", "dot size = trade s…") are cut. The visitor must pan about 19 px (35 px to keep the 16 px gutter). Mock: same problem, worse (100 %, 290 px cut). | **Defect** (candidate): known mock defect "at 390 px a window (600–680 px) is wider than the screen" is listed "fix in the build, do not copy" (`docs/mockups/README.md`). No spec requires the fit: 001 R15 fits CastleSiege only (`docs/specs/001-*/spec.md:49`), so this may belong to 001 (phone fit for 680 px windows) rather than 006. R3.a still holds: both R3 sentences are on screen (left aligned). Lead to classify. |
| L1 | Crawler, all | Title "Generalized Focused Web Crawler" (mock "Focused Web Crawler"); chips Python, asyncio, Anthropic API, Ollama, scikit-learn, Pandas, Matplotlib (mock 4 chips); two links "WSEProject ↗" and "CS-GY-6913-GeneralizedCrawler ↗" on a second line (mock "repo ↗"). About block 188.83 px high (mock 163.69, +25.14). | 001 R14: title, chips and links from `content/projects/focused-web-crawler.md`. Same reason as 001 L3 / 005 L1. |
| L2 | Insider, all | Title "Insider Trading Detection on Polymarket" (mock "Insider Trading on Polymarket"); chips add Python and Spark SQL (6 vs 4). About block same height (163.69). | 001 R14 (`content/projects/polymarket-insider-trading.md`). |
| L3 | Both, 1440 × 900 | Crawler sits at x 532, y 193 (mock x 400, y 206); insider at x 532, y 178 (mock x 532, y 198). The mock crawler is clamped at the sheet's left edge (its home x 400 is left of the centred position); the build centres it beside the card. The y offsets are half the extra window height (13 and 20 px). | 001 advisor decision (desktop insets, 001 J6) for x; lead decision (window heights) for y. |
| L4 | Crawler, all | Window 522 px (mock 496 natural height). Inner sizes same: lists 178, columns 157 × 212.25, header 30.25, demo area 265 (mock 264.39), footer 30.25. The extra 26 px is the L1 link line (+25.14) and 0.58 px slack under the footer. | Lead decision 2026-10-23 (crawler h 522, keep the mock's inner sizes) + L1. |
| L5 | Insider, chart complete | Window 551 px (mock 511). Four flagged cards (build data) make the flags column 247.5 px (4 × 57.38 + 3 × 6); mock shows three, column 207.45. Note and footer move down 40 px. The mock would grow by the same 40 px with four entries (its window has natural height). | Seeded data (R12: build has 4 flagged trades, mock seed 7 gives 3) + lead decision (insider h 551). |
| L6 | Insider, Replay before the spike | Fixed 551 px window: with the list hidden, about 40 px of empty space between the R3 note and the footer (mock: window shrinks to its content, 511). | Lead decision (fixed insider h 551, keeps the window from growing at the spike). Listed for the owner. |
| J1 | Both, all | Home ⌂ button at the right of each title bar. | 001 R9. |
| J2 | Crawler, all | Rows, scores, hosts/paths and precision values differ (e.g. light 1440: build 31 pages, 38/67/75/100 %; mock 26 pages, 0/43/71/80 %). | R12 allowed: seeded data (R4). |
| J3 | Insider, all | Price curve, dot sizes and positions, wallet ids (build "W-UXPY", mock "0x0056…21"), amounts and hours differ; build plateau after the spike about 90 ¢ (mock about 85 ¢). Build has 4 flagged entries (one at 14 h before), mock 3. | R12 allowed: seeded data; invented wallet ids so nothing looks like a real wallet (R3). |
| J4 | Both, all | Note under the demo: "Simulated demo. The interactive tool is planned and is not available here." (+ insider "It flags candidates and does not prove insider trading.") instead of the mock's "Placeholder: …" sentences. Insider note is 2 lines in both (40.28 px). | R12 allowed: R3 wording. |
| J5 | Crawler, all | Rejected rows: `--ink-dim` at full opacity (light rgb(95,87,79), dark rgb(194,195,199)), ✗ and strike-through kept; mock: `--ink` at opacity 0.45. Rows look a little darker/lighter than the mock's faded rows. | R12 allowed: contrast fix (R8). |
| J6 | Crawler, paused | Pause button's name "Resume" while it shows ▶ (mock keeps "Pause"). Same ▶ glyph and place. | R12 allowed: accessibility text (R9). |
| J7 | Insider, all | A hidden text summary of the chart next to the canvas (`.sr`, not visible). | R12 allowed: accessibility text (R9). |
| J8 | Insider, all | Canvas backing store 872 × 406 at device scale 2 (mock fixed 900 × 420); same CSS box 440 × 207.45 and same drawn geometry (axis labels, spike band, label, line width by eye). Build text and lines look sharper at 2×. | 006 R10 (store follows device pixel ratio). Not a layout difference. |
| J9 | 390 × 844 | Build at 58 % zoom (mock 100 %, window cut off at the right after 374 px). | 001 R15 (start zoom); known mock defect (window wider than a phone). See D1 for the remaining build overflow. |
| J10 | Both, motion | Crawler steps on a setTimeout chain only while visible and not paused; insider plays on first view and on Replay with a timer, no pop-in fade on rows/cards (mock: `pop` animation from opacity .3). | R12 allowed: motion behaviour (R5, R6, R8). Not judged in shots. |
| J11 | Full views | Other windows (CastleSiege, quick paint, Pentimento) and the card/bar differ. On the phone full views the CastleSiege board area above the crawler shows white (board not drawn in the shot). | Out of 006 scope (001, 003, 005). The white board was not investigated (Unverified whether it is a lazy load at 58 % or a CastleSiege issue). |

### What matches

- (a) Controls: crawler — four columns in the same order (URL keywords, static sim., adaptive sim., LLM judge),
  precision in each header, note, footer "N pages · precision shown per strategy" / "✓ relevant · ✗ rejected",
  Pause ❚❚/▶ in the title bar. Insider — canvas, flagged list (or the "Wallets that bought big before the spike show
  up here." note before the spike), note, footer "t = Nh of 160h" / "dot size = trade size", Replay ↺ in the
  title bar.
- (b) Grouping: about block, demo area, footer in the same order in both windows.
- (c) Position inside the window: title bar 33.34, about blocks at y 35.34, demo grids at x 14; insider canvas at
  (14, 211.03) and flags at x 466 in both (observed, `measure.txt`).
- (d) Spacing / inner sizes (observed, DOM at 1×): crawler lists **178** px, columns 157 wide with 8 px gaps,
  column header 30.25 (padding 3px 6px 2px), list padding 4px 6px, row 17.55 px; insider canvas outer
  **440 × 207.45**, flags column 200 px with a 12 px gap, flagged card 200 × 57.38 with **padding 5px 7px** and 6 px
  gaps; demo area padding 12 px; about padding 12px 14px; footer 30.25 with padding 3px 10px 2px; window width 680.
- (e) Type: Pixel Operator 17 px bar, 15 px column headers and footers; Pixel Operator Mono 13 px rows, 14 px flag
  cards; Instrument Sans 16 px blurb, 13 px notes; canvas axis labels in Pixel Operator.
- (f) Colour, borders: plum (light) / pink (dark) title bars, 2 px outlines, `--paper-2` column headers and
  footers, accent scores and wallet ids, chart: ink line, blue trade dots, red flagged dots after the spike, orange
  band with "spike" label, grid lines and ¢ axis — same in both themes by eye.
- (g) Text: bar titles ("crawl — topic: "protein structure prediction"", "spike-scan — example market"), blurbs,
  "DEMO COMING" badges, years, footers match (except L1, L2, J4).
- Replay at hour 110: both show the line and dots up to hour 110, no band, no red dots, the "show up here" note,
  footer "t = 110h of 160h".
- No third-party request from the build in any run (observed: `external: []` in `build/log.json`). The mock loaded
  Google Fonts (expected, mock only).

### Limits

- Chromium only; Firefox and WebKit not shot.
- Touch, drag and throw not shot; motion not judged by hand (J10).
- Reduced motion not shot (R7 is covered by T5 tests).
- The mock's phone centring used an extra mock-only `closeRail(); panTo(id)` step, and the mock's buttons were
  pressed by dispatched clicks (see above); the mock file was not edited.
- The mock's freeze wraps `requestAnimationFrame` (mock only); the build's uses Playwright's clock.
- Data differs by design (seeded vs mock seed / `Math.random`), so no pixel comparison of rows or the chart;
  geometry compared by DOM measurement at 1× and by eye on 2× pairs.
- The mock phone run had no `isMobile`.
- Phone pairs are at different zooms (build 58 %, mock 100 %), compared by eye only.

### Result of pass 1 (lead)

- **D1 → owner item (O1), not a 006 defect.** At 390 × 844 the 680 px crawler and insider windows are wider than the
  screen at the 58 % phone zoom. 001 R15 fits only CastleSiege (owner decision 2026-10-22: "the first window fits
  the screen width"), and `docs/mockups/README.md` lists wide windows on phones as a known mock defect. Fitting
  every window on a phone (for example, card navigation zooming to the target's width) would change 001 behaviour,
  which is Verified (local). Listed for the owner; no change tonight.
- **L6** (about 40 px of empty space in the insider window before the spike, from the fixed 551 px height) is
  listed for the owner with the window-height decision.
- No other defect.
