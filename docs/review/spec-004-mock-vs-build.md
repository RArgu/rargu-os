# Spec 004: mock vs build (compare-vs-mock)

Task T8 (R2, R14). Shot by a subagent with Playwright. Draft for the lead agent. Nothing fixed.

## Pass 1 — 2026-10-23

### What was compared

- Mock: `docs/mockups/rargu-os-v0.7.html`, SHA-256
  `03552b06b352ddde27c35d5a4415e4f3c4012dc7a30fbb19c3209ce8b640f340` (observed: `shasum -a 256`; matches
  `docs/mockups/README.md`).
- Build: branch `spec-004-tools`, commit `fb07a04`, working tree clean before the run (observed: `git status`).
  Served from an e2e-mode build in its own folder (`npm run build -- --mode e2e --outDir dist-t8`, then
  `npx vite preview --outDir dist-t8 --port 4212`), page `/next`. The e2e mode adds the host's test fixture apps
  only. It does not change the sheet or the three tools (inferred from `playwright.config.ts:17-19` comments).
- Browser: Playwright 1.63.0 Chromium, device scale 2.
- Viewports and themes: 1440 × 900 and 390 × 844, light and dark. Phone: build with `isMobile` and touch, mock with
  touch only (as in the 001, 005 and 006 passes).
- Views, in this order in one page per viewport and theme:
  1. **Start view** after load.
  2. **Quick tools views:** the card's Paint, Music and Notes icons, one after the other (build
     `.app[data-go="paint|music|notes"]`, mock `[data-tool="paintwin|musicwin|noteswin"]`). On the phone the card
     toggle is pressed first (build `.railtoggle`, mock `#railToggle`).
     - **Mock phone, extra step (mock only):** the mock's icon handler pans before it closes the card
       (`docs/mockups/rargu-os-src/part2.js:148`), so the window lands under the open card. After the click the
       script runs `closeRail(); panTo(id, true)` (the mock's own functions), as in 006 pass 1.
     - Build: the script waits for the window title ("Paint - ", "Music - ", "Notes - ") and, for Music, for Play
       to be enabled (demo parsed, R6).
  3. **After Reset:** the card's `#reset` (phone: card toggle first), from the Notes view.
- Settle: window rectangles, view scroll and zoom unchanged for 400 ms (rAF poll, 10 s cap). No fixed sleeps.
- Measurements: DOM rectangles of the three windows on screen and in sheet px, title text, title bar height, colour
  and font, demo area and app root sizes, active element.
- Scripts and images (scratchpad, not in the repo):
  `/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/t8/shoot.mjs`;
  shots in `.../t8/mock/`, `.../t8/build/`; pairs (mock left, build right, `pair.py`) in `.../t8/pairs/`; logs
  `.../t8/mock/log.json`, `.../t8/build/log.json`. Pair names: `<viewport>[-dark]-{start,tool-paint,tool-music,
  tool-notes,reset,win-paint,win-music,win-notes}.png`.

### Measured positions (observed, `log.json`)

| Window | Mock v0.7 (sheet x, y, w × h) | Build (sheet x, y, w × h) | Build app root (client) |
|---|---|---|---|
| Paint | 1920, 760, 434 × 350 | 1920, 760, 434 × 350 | 430 × 286 |
| Music | 2400, 700, 556 × 348 | 2400, 700, 556 × 348 | 552 × 284 |
| Notes | 1920, 1150, 424 × 364 | 1920, 1150, 424 × 364 | 420 × 300 |

- Same in all 4 viewport/theme runs and in all 5 views (start, three tool views, Reset) (observed). At 390 × 844 the
  log shows sheet values like 1911.5, 756.6, 432.1 × 348.4. This is a rounding effect of the measurement: the script
  divided by the displayed "58%", but the real phone zoom is 0.5774 (250.6 / 434). With 0.5774 the values are
  1920, 760, 434 × 350 (derived).
- Client areas equal the manifest sizes (430 × 286, 552 × 284, 420 × 300) (observed). Demo areas are 313, 311 and 327
  px = 27 px menu row + client height (observed). Title bars 33.34 px in both (observed).
- 1440 × 900 tool views: each window lands at the same screen position in mock and build (Paint 655, 279; Music 840,
  280; Notes 660, 410) (observed).

### Differences

Layout and order first.

| ID | View | Difference | Reason |
|---|---|---|---|
| **D1** (candidate) | 390 × 844, light and dark, Notes view | The build's view stops at the sheet's bottom edge (scroll 173 = max). Notes is at screen y 561–771. The map box (x 234–374, y 721–828) covers the lower right of the Notes window: x 234–317, y 721–771. That is the last 34 px of the editor and the right part of the status bar ("Ln 1, Col 1 0 chars" stays visible at the left). Mock (100 %): Notes ends at y 718, above the map. | No reason found in 004. Cause (derived): 58 % phone zoom plus the sheet edge clamp (Notes bottom at sheet y 1514, sheet h 1640). The editor is still usable and no control is hidden, so R2 "every control is reachable" holds (derived). Lead to classify: accept as 001 view behaviour, or a defect (for example, allow the view to pass the sheet edge by the map height on a phone). **Lead disposition:** deferred under the owner's 2026-10-24 decision ("Forget about windows not fitting in phone for now, assume we'll switch to landscape"). Listed for the owner. |
| **D2** (pre-existing, not 004) | All, Music window | The Tracker instrument panel is 3 px too narrow: `.trk-side` scrollWidth 147 vs clientWidth 144 (overflow auto, so a 3 px horizontal scroll). The "Periodic" noise button shows "Periodi": its text needs 54 px, the button is 47 px. | **Same on the old OS at scale 1** (follow-up below). Not caused by 004. Button is reachable and works. Only its label is cut. Lead to classify (old-OS Tracker fix, outside 004). **Lead disposition:** accepted as a sheet-only fix in T9 (visitors see the cut label on the sheet, R2 layout); the old-OS scale-1 case is listed for the owner. |
| L1 | All | Window contents: build runs the real Paint (menu row, tool box, 320 × 200 white canvas, palette at the bottom, "320×200 1x" status), the real Tracker (File/Edit/Song/Help, Play, Play Pattern, Stop, Loop, BPM 126, Octave, Order list, pattern grid, instrument panel, piano) and the real Writer (File/Edit/View/Help, empty editor, "Ln 1, Col 1 0 chars" status). Mock: stand-ins (palette and thin/mid/fat/clear/save .png with a sample drawing; 4 × 16 step grid with play/clear and "112 bpm"; textarea with four sample lines, save .txt, "141 chars"). | Real app replaced the mock stand-in (004 R1, R3; owner decision 2026-10-22: the real apps; `docs/mockups/README.md` "What the mock fakes"). |
| L2 | All | Inner heights differ: mock `.wbody` 316.25 / 180.25 / 232.25 px (content height), build demo areas 313 / 311 / 327 (fixed). Outer windows are equal. | Same as L1: stand-in content. Outer size from mock v0.7 (owner approval 2026-10-24). |
| L3 | 390 × 844 | Build at the phone start zoom (0.5774, shown "58%"), mock at 100 %. Windows sit centred in the free area below the card header (Paint x 69.65, Notes x 72.65). Music sits at x 43.81, not centred: the view stops at the sheet's right edge (derived: Music right 2956 + 44 px margin = 3000). | 001 R15 (start zoom) and 001 view limits. Phone pairs compared by eye only. |
| L4 | Full views | Other windows differ: CastleSiege 654 px tall (mock 658), Pentimento 635 (mock 542), crawler 522 (mock 496), insider 551 (mock 511); project text, chips and links differ. These show at the edges of the Quick tools views. | 003 T8 (CastleSiege, owner note 2026-10-24 in the 004 approval record); 005/006 lead decisions (morning report; `docs/mockups/README.md` v0.7 row); 001 R14 content. Out of 004 scope. |
| L5 | All, card | Quick tools labels sit under the icons in the build; beside the icons in the mock. Card text differs (no "New York", other blurb). | Known mock defect, "fix in the build" (`docs/mockups/README.md`); 001 content. |
| J1 | All | Titles: build "Paint - untitled", "Music - demo.trk", "Notes - untitled" (after Save: "Notes - untitled.txt"); mock "quick paint", "music maker", "notes.txt". | 004 R1 (titles start with the card names and keep the file name and modified marker). "Notes - untitled" before a save is the Writer rule (`src/apps/writer/main.ts:137`) and the tested value (`tests/e2e/quick-tools-notes.spec.ts:73`). |
| J2 | All | Home ⌂ button at the right of each title bar ("Send Paint home" and so on). | 001 R9. |
| J3 | Dark | The real apps keep their own surfaces: Notes editor black with a blue focus ring when active, Paint canvas surround dark checker, Tracker grid black with green/red text. Mock stand-ins use the sheet's navy and paper colours. Title bars are equal (pink `rgb(255,119,168)`, Pixel Operator 17 px). | Real app replaced the stand-in (002 host styles). |
| J4 | Tool views | After an icon press, the build moves focus into the app (Music: pattern grid; Notes: editor; Paint: its window, which has no inner focus target). The mock keeps focus on the icon. | 004 R11 (icon activates the tool), tested in `tests/e2e/quick-tools.spec.ts:496-560`. |
| J5 | 390 × 844, mock only | The mock's start view and its Reset view differ by 14 px vertical scroll; the build's start and Reset views are identical. | Mock behaviour, not a build difference. |

### D2 follow-up: old OS vs sheet (observed)

Chromium, e2e build on port 4212. Old OS at `/`: Tracker opened with Terminal `open ~/Music/demo.trk` (as in
`tests/e2e/desktop.spec.ts:162-166`). Sheet at `/next`: the card's Music icon. Script:
`/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/t8/d2.mjs` and
`d2s1.mjs`.

| Measure | Old OS 1440 × 900 (scale 2) | Old OS 1024 × 580 (scale 1, desktop policy) | Sheet 1440 × 900 |
|---|---|---|---|
| `--u` | 2px | 1px | 1px |
| Font (button) | Pixel Operator 24px | Pixel Operator 16px | Pixel Operator 16px |
| Button padding left/right | 4px / 4px | 2px / 2px | 2px / 2px |
| `.trk` width | 1104 (= 552 × 2) | 552 | 552 |
| `.trk-side` scrollWidth / clientWidth | 288 / 288 | **147 / 144** | **147 / 144** |
| "Periodic" scrollWidth / clientWidth | 93 / 93 (text 78) | **54 / 47** (text 52) | **54 / 47** (text 52) |
| `.segmented` scrollWidth / clientWidth | 188 / 188 | 102 / 94 | 102 / 94 |

- Result: **pre-existing.** The old OS at scale 1 shows the same 3 px scroll and the same cut label, with the same
  computed values as the sheet (observed).
- Cause (derived): the old OS sets text to 16 / 24 / 32 px for scale 1 / 2 / 3 (`fontStep`, `src/wm/policy.ts`;
  `src/wm/wm.ts:196-197`). The layout scales with `--u`. So text is 16 app px at scale 1 but only 12 app px at
  scale 2 (24 ÷ 2). The panel fits at scale 2 and 3. It does not fit at scale 1. The sheet uses the scale 1
  values (`--u: 1px`, `--text-size: 16px`, 002 R15, `src/sheet/host/styles.ts:28`), so it shows the scale 1
  overflow. No value differs between the sheet and the old OS at scale 1.
- The common 1440 × 900 old-OS view (scale 2) does not show the cut. That is why it was not seen before (inferred).

### What matches

- (a) The three windows exist with the same order on the sheet and in the card (Paint, Music, Notes).
- (b) Grouping: the cluster Paint above Notes, Music to the right, in the Quick tools area (x 1920–2956,
  y 700–1514).
- (c) Home rectangles equal v0.7 in every view, also after Reset (see the table above). Desktop tool views put each
  window at the same screen position as the mock.
- (d) Title bar 33.34 px, client areas equal the manifests (R2.a).
- (e) Title bar font Pixel Operator 17 px in both.
- (f) Title bar colours: plum `rgb(126,37,83)` light, pink `rgb(255,119,168)` dark, in both. Window outlines and
  shadows equal by eye. Map shows the tools in the same grey/ink as the mock.
- No third-party request from the build in any run (observed: `external: []` in `build/log.json`). The mock loaded
  Google Fonts (mock only).

### Sheet-only gate check (R14)

`git diff dfe4abd..HEAD -- src/apps` (observed). 4 files, 254 insertions, 31 deletions. Every change and its gate:

| File | Change | Gate |
|---|---|---|
| `src/apps/lib/open.ts` | New `SHEET_NAMES`, `onSheet(os)` (`os.env.DISPLAY === "sheet"`), `appName(os, name)` | `appName` returns the sheet name only when `onSheet(os)`, else `name` |
| `src/apps/lib/open.ts` | `helpMenu`: no Guided walkthrough and no Manual on the sheet | `if (!sheet)` / `manual && !sheet` |
| `src/apps/lib/open.ts` | About label and alert text use `appName` | `appName` (old OS: unchanged `os.app.name`) |
| `src/apps/paint/main.ts` | Toolbar Wallpaper button removed | `onSheet(os) ? [] : [...]` |
| `src/apps/paint/main.ts` | Title uses `appName(os, "Paint")` | `appName` |
| `src/apps/paint/main.ts` | Two-finger pan through the stage transform (`startSheetPan`, `panSheet`, `endSheetPan`) | `startSheetPan` runs only `if (onSheet(os) && !sheetPan)`; `panSheet` only `if (sheetPan)`. `endSheetPan()` on pointer up runs on both, but is a no-op when `sheetPan` is null (old OS) (derived) |
| `src/apps/paint/main.ts` | Export to Downloads writes `~/Downloads/<name>` (host download) | `if (onSheet(os))`, else the old `downloadBytes` |
| `src/apps/paint/main.ts` | File menu "Set as Wallpaper" removed | `onSheet(os) ? [] : [...]` |
| `src/apps/tracker/main.ts` | Exported `WAV_MAX_SECONDS`, `wavRefusal()` | Called only in the `sheetMode` branch of `exportWav` |
| `src/apps/tracker/main.ts` | `ready` flag: `play()` returns early, Play / Play Pattern buttons and menu items disabled until a song loads | `ready = !sheetMode`: always true on the old OS, so `disabled = false` there (derived). Before 004 the buttons were never disabled (observed: no other `playBtn.disabled` in the file) |
| `src/apps/tracker/main.ts` | `exporting` guard, refusal, no second download question, failure alert | `if (sheetMode)` blocks; Export WAV… `disabled: exporting` is always false on the old OS (derived) |
| `src/apps/tracker/main.ts` | Title uses `appName(os, "Tracker")`; menu key adds `ready` and `exporting` | `appName`; the key parts are constant on the old OS (derived) |
| `src/apps/writer/main.ts` | Title uses `appName(os, "Writer")` | `appName` |
| `src/apps/writer/main.ts` | File menu Run (and its separator) removed | `onSheet(os) ? [] : [...]` |
| `src/apps/writer/main.ts` | Escape leaves the editor (`leaveText`) | `ev.key === "Escape" && onSheet(os)` |

Result: every sheet-only change is behind `onSheet(os)` / `sheetMode` (both `os.env.DISPLAY === "sheet"`). The two
ungated lines (`endSheetPan()` call, `playBtn.disabled = !ready`) do nothing different on the old OS (derived).

### R14.a old-OS tests (observed)

Command: `CI=1 npx playwright test -c pw-t8.config.ts --project=chromium --project=mobile
tests/e2e/extras.spec.ts tests/e2e/compact-paint-oldos-pan.spec.ts` (temporary config, port 4212, build in
`dist-t8`; config and folders deleted after the run). Result: **28 passed** (27 in `extras.spec.ts` on chromium,
1 in `compact-paint-oldos-pan.spec.ts` on mobile), 11.0 s.

### Limits

- Chromium only. Firefox and WebKit not shot.
- Touch, drag, throw and motion not judged. Reduced motion not shot.
- The mock's phone tool views used an extra mock-only `closeRail(); panTo(id, true)` step. The mock file was not
  edited.
- The mock phone run had no `isMobile`.
- Phone pairs are at different zooms (build 58 %, mock 100 %), compared by eye and by DOM numbers.
- Sizes from DOM at device scale 2; colours by eye except the title bars.
- The build was an e2e-mode build, not `npm run build` production output.
