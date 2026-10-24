# Spec 005: mock vs build (compare-vs-mock)

Shot by a subagent with Playwright (T7); the lead agent classified the list and fixed D2.

## Pass 1 — 2026-10-23

### What was compared

- Mock: `docs/mockups/rargu-os-v0.6.html`, SHA-256
  `059b7b873f1e1173126f8b540e51d562555532800c06991affc0f87d117177ed` (observed: `shasum -a 256`; matches
  `docs/mockups/README.md`).
- Build: `npm run build && npx vite preview --port 4327 --strictPort`, `/next`, commit `17b5eef`. No tracked file
  changed (observed: `git status --short` shows only the untracked spec-006 files, which no tracked file imports).
- Browser: Playwright 1.63.0 Chromium, device scale 2.
- Viewports and themes: 1440 × 900 and 390 × 844, light and dark. Phone: build with `isMobile` + touch; mock with
  touch only (no viewport meta), as in 001 pass 1.
- Centring: the card's project link `[data-go="castlewars"]` / `[data-go="pentimento"]` in both; on phone the card
  toggle first (mock `#railToggle`, build `.railtoggle`). Settle = window transforms, scroll and zoom unchanged
  for 400 ms.
- Castle Wars, paused on each of idle, walk, attack, victory, death:
  - Build: waited for the sprites (`.cw-state` hidden), pressed **Pause first**, then each animation button.
    `choose()` rewinds to the tag's first frame and draws; paused, no timer starts
    (`src/sheet/demos/castlewars.ts` `choose`/`sync`). So every shot is frame 1 of the tag. (Pressing the
    animation first and then Pause gives frame 1 or 2 by timing.)
  - Mock (no Pause): an init script wraps `window.setTimeout` so each callback is dropped while
    `window.__freeze` is true; set it after centring, waited 500 ms (the pending `cwLoop` tick is dropped, so the
    chain ends), then pressed each tab (`frame=0`, draws at once). Reduced motion does not freeze the mock: it only
    slows the loop to 900 ms (`reused.js:52`). Flag cleared before the Pentimento run.
  - Check (observed): canvas screenshots 1 s apart were identical in all eight runs (`cwFrozen: true` in
    `mock/log.json`, `build/log.json`).
- Pentimento: before a run; after "Run the agent" and the run finished (mock: `#pentCmd` has "done: 2 layers";
  build: status "Sketch done: 2 layers"), plus 500 ms.
- Crops: window rectangle + 16 px margin, clipped to the viewport. One full view per viewport/theme for each window
  (`*-full-cw.png`, `*-full-pent.png`).
- Script: scratchpad `t7-005/shoot.mjs`; DOM measurements `t7-005/measure.mjs` → `t7-005/measure.txt`.
- Images: scratchpad `t7-005/mock/`, `t7-005/build/`, `t7-005/pairs/` (36 pairs, pair.py: mock left, build right).

### Differences

| ID | View | Difference | Reason |
|---|---|---|---|
| J9 (was D1) | Castle Wars, all | The gap under the animation buttons is 5 px (mock 10 px): `.tb` margin-bottom 5 px, canvas top at y 223 in the window (mock 228) (observed, `measure.txt`). The sprites sit 5 px higher. Window height is the same (522). | Lead decision: part of the allowed unit-name text (R9). The 5 px are the room the unit-name line needs inside the fixed 522 px window; restoring 10 px would need a taller window. Listed for the owner. |
| **D2** | Pentimento, all | The sample-image box is 390 × 195 (mock 390 × 197); its drawn area is 386 × 191, not 2:1 (mock 386 × 193). Cause (derived): `.pent canvas { aspect-ratio: 2 }` with `box-sizing: border-box` makes the border box 2:1, the mock's `height:auto` makes the content box 2:1 (`src/sheet/demos/pentimento.css`, mock `part1.html:280`). The image is squashed about 1 % and the parts below sit 2 px higher (cmd at 416 vs 418). | **Defect** (small; no allowed reason). |
| L1 | Pentimento, all | Stack chips include "TypeScript" (mock: Swift 6, AppKit, Metal, Claude Agent SDK). No wrap; about block same height (164). | 001 R14: chips from `content/projects/pentimento.md:4`. Same reason as 001 L3. |
| L2 | Both, 1440 × 900 | Centred window sits 24 px lower than in the mock (Castle Wars top y 164 vs 140; Pentimento 104 vs 80); same x (572). Both views are clamped at the sheet's top edge; the build shows its top inset. | 001 advisor decision (T7, desktop insets; 001 J6). |
| J1 | Both, all | Home ⌂ button at the right of each title bar. | 001 R9. |
| J2 | Castle Wars, all | Pause button at the right of the animation row; it reads "resume" in these shots (paused). | R9 allowed (Pause button), R1. |
| J3 | Castle Wars, all | Line under the canvas: "Top row: swordsman, spearman, hammerman · bottom row: archer, knight, wizard". | R9 allowed (unit-name text), R1. |
| J4 | Pentimento, all | "Sketch of the planned agent CLI · nothing built yet" beside "Run the agent"; the footer is one phrase with a capital S (mock: two spans, "sketch of the planned agent CLI" left, "nothing built yet" right). | R9 allowed (disclaimer line), R6 text. Known. |
| J5 | Pentimento, before a run | Window 635 px high with a five-line command panel (mock 542, one-line panel). After a run both are 635 and the panel is 132 px. | R9 allowed (advisor decision 2026-10-23, T5). |
| J6 | Castle Wars, motion | Frame times follow the JSON durations (mock: fixed 420/120/150/300/180 ms per tag). | R9 allowed (JSON frame durations), R1. Not judged in shots. |
| J7 | 390 × 844 | Build at 58 % zoom, whole window on screen, top edge just under the folded bar (y 86); mock at 100 %, window 600 px wide, cut off at the right. | 001 R15 (start zoom), 001 advisor decision T6 (phone top inset), known mock defect (window wider than a phone). |
| J8 | Full views | Other windows (quick paint, music maker, Insider) and the card differ. | Out of 005 scope: 001 L1/L2 (card), specs 003/004/006. |

### What matches

- (a) Controls: five animation buttons in the same order and style, canvas, footer with the animation name and
  "6 units · 19–21 frames each"; Pentimento image, layers list, command panel, "▶ Run the agent".
- (b) Grouping: about block, demo area, footer in the same order in both windows.
- (c) Position: windows centred at the same x on desktop; title bars, about blocks and tab rows at the same
  offsets in the window (`measure.txt`).
- (d) Spacing: about blocks (140 / 164 px), padding 12 px 14 px, tab row 30 px, canvas 560 × 250, footer 30 px,
  Castle Wars window 522 px, Pentimento grid 572 px with a 170 px layers column, button 117 × 30.
- (e) Type: Pixel Operator for title, buttons, footer; Pixel Operator Mono 15 px in the panel; Instrument Sans for
  blurb, chips, layers (13 px).
- (f) Colour, borders, icons: light and dark palettes, plum/pink title bars, pressed-button fill, black panel with
  green text, outline borders, layer eye ◉ and the new-layer chip fill match.
- Castle Wars sprites: the canvas pixels of frame 1 of each of the five tags are identical between mock and build,
  light and dark, at 1440 × 900 (observed: PIL difference of the two 560 × 250 canvas crops at 2×, 0 pixels over a
  threshold of 16 in all ten).
- Pentimento after a run: same four command lines and "done: 2 layers", "Text: SUMMER SALE" above "Background",
  dashed yellow box around the text.
- (g) Text: titles, blurbs, button labels, panel lines match (except J3, J4, L1).
- (h) Motion was not judged by hand. Timing (R1.a), visibility (R4.a) and reduced motion (R7.a) are covered by the
  T3–T6 tests.

### Budget (001 R22)

- `npm run build` (observed, `t7-005/build.log`):
  `sheet-guard: "next" JS + CSS 13.7 KiB gzip (2 chunks, 1 css, budget 100 KiB)`.
- Sprite PNGs in `dist/assets/` (bytes, observed `ls -l`; same sizes as `src/apps/castlewars/art/*.png`):
  archer 8,482 · swordsman 9,049 · wizard 9,651 · hammerman 9,684 · spearman 9,857 · knight 12,617
  (total 59,340 B ≈ 58.0 KiB).
- Sprites are not in the first-load JS/CSS (observed): `next.html` loads `next-D1IJhb-y.js`,
  `modulepreload-polyfill`, `next-Bxpvp4SG.css` only; the JS has the six PNG names as URLs and no `data:image/png`;
  the CSS has neither; the sheet guard allow-lists the six files outside the budget (`scripts/sheet-guard.ts:14`).
- At the 1440 × 900 and 390 × 844 start views the six PNGs were requested at load (observed, `build/log.json`
  `pngsAtStart`): Castle Wars is eligible at start, which R3 allows ("A window eligible at start may load at once").
- No third-party request from the build (observed: `external: []` in `build/log.json`). The mock loaded Google Fonts
  (expected, mock only).

### Limits

- Chromium only; Firefox and WebKit not shot.
- Touch, drag and throw not shot; motion not judged by hand.
- Reduced motion not shot (R7 is covered by T6 tests).
- Castle Wars compared on frame 1 of each tag only; other frames not compared.
- Canvas pixel check at 1440 × 900 only; phone pairs checked by eye (build at 58 %, mock at 100 %, not comparable
  pixel for pixel).
- Sizes from DOM measurement at 1× (`measure.txt`) and by eye on 2× pairs.
- The mock phone run had no `isMobile`.
- The mock freeze changes the mock's timers (page script, mock only); the mock file was not edited.

### Result of pass 1

- **D2 fixed** by the lead agent: `aspect-ratio: 2` removed from `.pent canvas` (`src/sheet/demos/pentimento.css`);
  the canvas backing store is always 2:1, so the content box is 2:1 as in the mock. Observed after the fix
  (Playwright Chromium, `vite preview`, 1440 × 900): the canvas box is 390 × 197, as in the mock. `pentimento.spec.ts`
  and `wip-motion.spec.ts` on chromium, firefox, webkit: 45 passed.
- **D1** reclassified as J9 (allowed unit-name text). For the owner.
- No other defect.
