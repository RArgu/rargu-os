# Spec 001: mock vs build (compare-vs-mock)

Shot by a subagent with Playwright; the lead agent checked the pairs, classified D2 and fixed D1.

## Pass 1 — 2026-10-23

### What was compared

- Mock: `docs/mockups/rargu-os-v0.6.html`, SHA-256
  `059b7b873f1e1173126f8b540e51d562555532800c06991affc0f87d117177ed` (observed: `shasum -a 256`; matches
  `docs/mockups/README.md`).
- Build: `npm run build && npx vite preview --port 4317`, `/next`, commit `6e3c150` (working tree also had the T8
  changes to `scripts/sheet-guard.ts`; no site code changed).
- Browser: Playwright 1.63.0 Chromium, device scale 2.
- Viewports and themes: 1440 × 900 and 390 × 844, light and dark.
- States: (a) start view; (b) after Reset (view scrolled 500, 400 first, then the card's Reset; on phone the about
  bar opened first); (c) phone only: card open (about ▾ pressed, after the same scroll).
- Phone: the build ran with `isMobile` and touch. The mock has no viewport meta (the artifact viewer adds one), so it
  ran with touch and a 390 px layout viewport, without `isMobile`.
- Script: scratchpad `t8/shoot.mjs`; settle = window transforms, scroll and zoom unchanged for 400 ms.
- Images: scratchpad `t8/mock/`, `t8/build/`, `t8/pairs/` (pair.py), close-up crops in `t8/crops/`.

### Differences

| ID | View | Difference | Reason |
|---|---|---|---|
| **D1** | 390 × 844, all states | The folded bar's "about ▾" / "close ▴" toggle is smaller in the build (class `btn small`, `src/sheet/main.ts:18`); the mock uses `btn railtoggle` at the normal button size (mock line 189). The bar is about 6 px shorter as a result. | **Defect** (no spec or owner reason). |
| J9 (was D2) | All, card | Quick tools labels are in the pixel font at 14 px under the icons; the mock shows Instrument Sans at 15 px beside the icons. | Known mock defect (`docs/mockups/README.md`). Lead check (observed, `part1.html`): the mock's own `.app` rule is column, `--font-display`, 14 px, which the build matches; the mock's `.index button` rule (higher specificity) overrides it, which causes both the position and the face. Not a build defect. |
| L1 | All, card | Project list shows the full titles "Generalized Focused Web Crawler" and "Insider Trading Detection on Polymarket" (mock: "Focused Crawler", "Insider Trading"). On desktop they wrap to two lines, so the card is about 32 px taller (Reset button top at y ≈ 425 vs 393, by eye). | Spec text: Approach "Card fields", project list ← the allowlist titles (R14). Owner may want short names in the card. |
| L2 | All, card | Role "Software Engineer" (mock "Software Engineer · New York"); tagline is the `identity.json` text. | Spec text: Approach "Card fields" (role ← `title`, tagline ← `tagline`), R11. |
| L3 | All, CastleSiege and Crawler | Extra stack chips and links (CastleSiege: "Web Workers", "Fly.io / Docker"; Crawler: Ollama, Pandas, Matplotlib, two repo links), so the about block is taller and wraps to a second chip row. | Spec text: R14 (content from `content/projects/*.md`). Window heights are the layout table's. |
| J1 | All windows | Home button ⌂ at the right of each title bar; the mock has a CastleSiege-only ↺ reset-board button and empty boxes. | R9 (Home); demo buttons are demo state (002–006). |
| J2 | All windows | Demo areas are blank placeholders of the reserved height; no window footers ("new game", "idle", "7×9 · 13 pieces a side"); no Castle Wars sprites, tabs or Pentimento sketch; crawler/insider demos absent. | Approach "Deferred differences" (002–006). |
| J3 | All, card | Quick tools labels sit under the icons. | Known mock defect (`docs/mockups/README.md`). |
| J4 | 390 × 844 | Start zoom 58 % (mock 100 %); CastleSiege's full width is on screen. | R15 / R15.a. |
| J5 | 390 × 844 | CastleSiege's top edge sits just below the folded bar at start and after Reset. | Advisor decision 2026-10-23 (T6, phone top inset). |
| J6 | 1440 × 900 | Start and Reset views are the same as the mock's first screen; the left/top inset is scrolled off. | Advisor decision 2026-10-23 (T7, desktop insets); no visible difference. |
| J7 | Focus | Title-bar button focus ring is `--ink` inset. | R18 (not visible in these shots). |
| J8 | 390 × 844, card open | The nearest-project mark is on Insider Trading in the build and on Focused Crawler in the mock. | Not a difference: the same scroll (500, 400) lands on a different sheet area at 58 % vs 100 %. |

### What matches

- (a) Card, eight windows, zoom bar (−, %, +, fit) and minimap exist in both; window titles and bar text match.
- (b) Grouping: same card sections (name, role, tagline, Resume/GitHub/LinkedIn, email + copy, On this sheet, Quick
  tools, hint, Reset page); each project's about block in its window.
- (c) Desktop: card at the same place; CastleSiege, Castle Wars, crawler and insider windows at the same screen
  positions (within 1 px at 2× crops); minimap and zoom bar at the same place. After Reset the desktop view is the same
  as the start view in both.
- (d) Card padding, rule lines, button gaps, chip gaps and window title-bar height match on desktop.
- (e) Pixel Operator for logo, buttons, labels, status badges; Instrument Sans for body; sizes match.
- (f) Light and dark palettes, plum/pink title bars, dark title text in dark mode (#111a33), hard shadows, status
  badges with ink text and hued border, grid paper, minimap colours match.
- (g) Hint text and button labels match.
- (h) Motion was not judged by hand in this pass. The physics, throw, wobble, Home, Reset and zoom are covered by the
  T5–T7 e2e tests against the spec numbers.

### Limits

- Chromium only; Firefox and WebKit not shot.
- Touch behaviour and gestures not shot; motion not checked by hand (h).
- Reduced motion not shot.
- Sizes by eye on 2× crops; no pixel diff (the mock's demos animate).
- The mock phone run had no `isMobile` (no viewport meta in the mock).
- Fonts: the mock loads Instrument Sans from Google Fonts, the build self-hosts it; no visible difference seen.

### Result of pass 1

- **D1 fixed** by the lead agent: the toggle's class is now `btn railtoggle` (`src/sheet/main.ts:18`), as in the
  mock. Checks after the fix: lint exit 0; `npm test` 689 passed; the seven sheet specs on chromium, mobile, firefox,
  webkit: 284 passed, 2 skipped; `npm run e2e`: 199 passed, 1 failed (the known flaky
  `[mobile] compact-extras.spec.ts:531`, old OS, see 001 T9). Not re-shot (one class change; the fix is the mock's
  value).
- **L1** (full project titles wrap in the card) is spec text (R14 titles); listed for the owner.
- No other defect. Every other difference has a reason in the table.
- Pairs page for the owner: published as a private claude.ai artifact (link in the ledger and the morning report).
