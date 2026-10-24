# Spec 003: mock vs build (compare-vs-mock)

Shot by a subagent with Playwright (T8); the lead classified the list: D1 fixed (h 654), D2 is the app's night theme (002 R14), listed for the owner.

Shot by a subagent with Playwright (T8). Draft for the lead agent; nothing fixed.

## Pass 1 — 2026-10-23

### What was compared

- Mock: `docs/mockups/rargu-os-v0.6.html`, SHA-256
  `059b7b873f1e1173126f8b540e51d562555532800c06991affc0f87d117177ed` (observed: `shasum -a 256`; matches
  `docs/mockups/README.md`).
- Build: `npm run build && npx vite preview --port 4338 --strictPort`, `/next`, commit `154affa`; `src/` clean
  (only `tests/e2e/castlesiege-sheet-perf.spec.ts` and `tests/e2e/castlesiege.spec.ts` modified, not in the build).
  Build log: `sheet-guard: "next" JS + CSS 97.9 KiB gzip (sheet and host 48.0, registered apps 50.0; 17 chunks,
  6 css; budget 100 KiB)`.
- Browser: Playwright 1.63.0 Chromium, device scale 2. One gap measurement also in Firefox and WebKit (D1).
- Viewports and themes: 1440 × 900 and 390 × 844, light and dark. Phone: build with `isMobile` + touch; mock with
  touch only (as in 001, 005, 006).
- State: start of a game. Build: the window centred by the card's link `[data-go="castlesiege"]`, waited for
  `.demo-area[data-host="running"]` and 63 cells. Mock: same link; on the phone the card toggle first and the
  mock-only `closeRail(); panTo("castlesiege")` step from 006 T6 (the mock pans before it closes the card). Settle =
  window transforms, scroll and zoom unchanged for 400 ms, then 500 ms.
- Crops: window rectangle + 16 px, clipped to the viewport; one full view each.
- Scripts: scratchpad `t8-003/shoot.mjs` (shots, DOM sizes in window px → `t8-003/mock/log.json`,
  `t8-003/build/log.json`). Images: `t8-003/mock/`, `t8-003/build/`, `t8-003/pairs/` (8 pairs, `pair.py`: mock
  left, build right).

### Differences

| ID | View | Difference | Reason |
|---|---|---|---|
| **D1** | All, all browsers | An empty strip of 4.4 px (Chromium), 5.0 (Firefox), 5.0 (WebKit) under the status bar, between the demo area's bottom and the window's bottom border. Window 658 = 2 + bar 33.34 + about 189.28 + demo 427 + 2 → 653.6 needed. Seen as a paper-coloured line under "Vs bot · Easy · …" in the light pairs. | **Defect** (candidate). The same slack was in 001's table before T1 (619 − 388 − 226.6 = 4.4), so T1 kept chrome 231 while the content needs ~226.6. Fix would be h 654 (or demoH 431) in `src/sheet/layout.ts` and the 001 table. Lead to classify. |
| **D2** | Dark, both viewports | The move list box is pure black `rgb(0,0,0)`, a hard black block on the navy panel. Light theme uses the paper colour `rgb(255,241,232)`. The mock's dark palette has no pure black fill (navy `rgb(17,26,51)` / `rgb(29,43,83)`). | **Defect** (candidate): no spec reason found; looks like the host's dark mapping of the app's white list background. Low; text contrast is fine. |
| L1 | All | The mock body (canvas board + a three-line text side panel) is replaced by the real app: menu row Game / Options / Help (27 px), board with frame 286 × 366 at 40 px cells, side panel 280 px with "Your move (White).", "Taken:", move list, Undo / New Game, and the six-piece reference; status bar "Vs bot · Easy · Balanced · Move 1". | Real engine and menus replace the stand-in (R4, `docs/mockups/README.md` "What the mock fakes"); menu row 002; wide layout R2. |
| L2 | All | The mock's footer "new game · 7×9 · 13 pieces a side" (`.wfoot`, 30.25 px) is gone; the app's status bar takes its place inside the demo area. | Real app (R4); the stand-in footer described the stand-in board. |
| L3 | All | Window 620 × 658 (mock 620 × 619, natural height). Demo area 427 (mock body 388). | 003 T1 (measured, recorded in 001's layout table). See D1 for 4.4 px of it. |
| L4 | All | Board colours: cream and rust-brown squares, the app's own piece art; the mock has cream/peach squares with a tinted middle row and its own drawn pieces. Pieces sit at the same start squares. Board is left-aligned at x 21 (mock canvas at x 14). | Real engine and art (R4; spec "Why": look like the current CastleSiege app). |
| L5 | All | Demo background, menu row and status bar are the host's panel grey `rgb(194,195,199)` (light) / navy `rgb(29,43,83)` (dark); mock body is white / navy. App text is Pixel Operator 16 px (mock side text Instrument Sans 14–16 px). | Real app look (R4, spec "Why") through 002's host styles; 16 px text R2. |
| L6 | All | About block 189.28 px (mock 163.69): chips add "Web Workers" and "Fly.io / Docker" (7 vs 5), so the link "castlesiege.fly.dev ↗" wraps to a second line. Status badge class `status play` (mock `status live`); same text and look. | 001 R14 (content file). Same reason as 001 L3 / 006 L1. |
| L7 | 1440 × 900 | Window at screen x 562, y 124 (mock x 360, y 100, at its home). | 001 advisor decision (centring beside the card, insets); y offset is half the extra height. |
| J1 | All | Home ⌂ button at the right of the title bar; the mock has ↺ "Reset board" there. | 001 R9 (Home); reset is Game → New Game… (R4). |
| J2 | 390 × 844 | Build at 57.7 % zoom: the whole window (358 × 380 screen px) fits between the 16 px gutters. Mock at 100 % cuts the window at the screen's right edge. Small text at 57.7 % (the 16 px app text draws at about 9 px; piece captions smaller). | 003 R3 / 001 R15 (phone fit); known mock defect (window wider than a phone). Text size listed for the owner, not a defect. |
| J3 | All | Turn text "Your move (White)." vs mock "White to move"; no mock help sentences. | Real app text (R4). |
| J4 | Focus | Inset focus ring on the window when focused; not shot (window not focused in these shots). | 001 R18. Not compared. |

### Fixes after the lead's decisions

- D2: not a defect (lead): the app's own night theme, mapped by 002 R14. Listed for the owner.
- D1: fixed. `src/sheet/layout.ts` CastleSiege h 658 → **654** (demoH 427 kept). Measured gap from the status bar
  to the window's inner bottom (window px, 1440 × 900 and 390 × 844): Chromium 0.375, WebKit 0.953, Firefox
  1.017–1.029; demo area 427 in all. 653 would cut 0.62 px of the status bar in Chromium, so 654 is the only
  integer with nothing cut in any browser. Firefox keeps ~1 px because its about block is 0.65 px shorter.
  Re-shot: `pairs/h654-1440x900-light-castlesiege.png`, `pairs/h654-1440x900-light-full.png` (no strip).

### What matches

- (a) Window parts in order: title bar, about block, demo area. Title text "castlesiege — vs. bot", grip ⠿.
- (c)/(d) Title bar 33.34 px at (2, 2), button 20 × 18 at (594, 9.17); about block at y 35.34 with padding
  12px 14px; meta row at (16, 164.44); window width 620; 2 px border; 5 px hard shadow (observed, `log.json`).
- (e) Pixel Operator 17 px bar title; Instrument Sans 16 px blurb and chips; same heading and year.
- (f) Plum title bar `rgb(126,37,83)` (light) / pink `rgb(255,119,168)` (dark); window background, border and
  shadow colours identical in both themes; green "PLAYABLE" badge.
- (g) Heading, year, blurb text identical.
- No third-party request from the build in any view (observed: `external: []` in `build/log.json`). The mock
  loaded Google Fonts (expected, mock only).

### Limits

- Chromium only for the shots; Firefox and WebKit only for the D1 gap measurement.
- Only the start of a game; a selected piece, the bot's reply, the rules panel, a won game and the menus open were
  not shot.
- Drag, throw and motion not judged by hand here (R8.a drag is covered by the e2e test).
- Reduced motion not shot (R9.a e2e covers it).
- The mock phone run had no `isMobile` and used the mock-only centring step.
- Phone pairs are at different zooms (build 57.7 %, mock 100 %), compared by eye.
