# 004 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Start after 002 is `Verified (local)`.

- [x] **T1** Measure the three windows, propose the layout, build mock v0.7, then stop (R2, R3)
  - Acceptance: Paint, Tracker and Writer run through the 002 host at scale 1 (resource `/home/guest/Music/demo.trk`
    and the icons they use added to the allowlist). Their outer rectangles (client area = manifest size, plus title
    bar and menu row) are measured. A cluster in the Quick tools area is proposed: inside 3000 × 1640, no overlap with
    each other or any project window at home. The proposed rows are written into the 001 layout table as a proposal.
    The retained menus of each app (R3, for example Paint's Export to Downloads, Tracker's instrument and pattern
    editing, Writer's Find/Replace and view settings) are listed in the ledger. The mock sources take the new
    rectangles, and `docs/mockups/rargu-os-src/build.py` writes a new output, `rargu-os-v0.7.html`; v0.6 stays
    unchanged. `docs/mockups/README.md` lists v0.7 as pending review. **Stop** for the owner's review of the mock. No
    code beyond T1 before the owner approves v0.7.
  - Verify: copy `docs/mockups/rargu-os-src/` to `rargu-os-src-v0.6/` first; then
    `python3 -I docs/mockups/rargu-os-src/build.py rargu-os-v0.7.html` writes v0.7 (sha256 recorded); v0.7 also
    carries the CastleSiege height measured in 003 T1 if it differs; v0.6 rebuilds to its recorded hash;
    measurement e2e run in Chromium; ledger has the sizes and the menu list; owner review of v0.7.
  - Files: `docs/mockups/rargu-os-src/build.py`, `docs/mockups/rargu-os-src/part2.js`, `docs/mockups/README.md`,
    `docs/specs/001-sheet/spec.md` (layout table rows), `src/sheet/host/resources.ts`, `docs/ledger/`.
- [x] **T2** Layout in the sheet (R1, R2)
  - Acceptance: `layout.ts` has the approved rectangles; the card's Quick tools labels are Paint, Music, Notes;
    client areas equal the manifest sizes; every control is reachable.
  - Verify: `npm run e2e` (e2e R2.a; 001 R7.b with the new table).
  - Files: `src/sheet/layout.ts`, `next.html`, `tests/e2e/quick-tools.spec.ts`.
- [x] **T3** Sheet titles, removed items and About (R1, R3, R8, R14)
  - Acceptance: on `env.DISPLAY === "sheet"` only: titles start with Paint, Music, Notes and keep file name and
    modified marker; Paint wallpaper items, Writer Run and manual/Guide Help items are gone; each Help menu has one
    item, About, which opens, also after a menu rebuild; the retained menus of T1 are present. The old OS apps are
    unchanged.
  - Verify: `npm run e2e` (e2e R1.a, R8.a, retained-menu check for R3; R14.a: existing `tests/e2e/extras.spec.ts`
    on `/`).
  - Files: `src/apps/lib/open.ts`, `src/apps/paint/main.ts`, `src/apps/tracker/main.ts`, `src/apps/writer/main.ts`,
    `tests/e2e/quick-tools.spec.ts`.
- [x] **T4** Paint: blank canvas, files and two-finger pan (R4, R5)
  - Acceptance: Paint opens with a blank 320 × 200 canvas. Save, Save As and Export download a `.png`. Open… loads a
    PNG up to 800 × 800; a larger or invalid file shows Paint's error and keeps the picture. Two-finger canvas pan
    divides screen deltas by the sheet zoom the host exposes, so the picture follows the fingers at any zoom until
    the scroll limit, and the sheet does not move.
  - Verify: `npm run e2e` (e2e R4.a, decoding the PNG; R5.a in the mobile project at zoom 60 %, 100 %, 160 %).
  - Files: `src/apps/paint/main.ts`, `src/sheet/host/os.ts` (zoom value), `tests/e2e/quick-tools-paint.spec.ts`,
    `tests/fixtures/quick-tools/` (PNG fixtures).
- [x] **T5** Music: demo ready, play, save and WAV export (R6, R7)
  - Acceptance: Play is disabled until `demo.trk` has parsed; one Play activation starts playback when audio is
    allowed, else Play stays usable for a retry. Save and Save As download a `.trk` (`demo.trk` for the demo); Open…
    loads a `.trk`. Export WAV… downloads one `.wav` with no second download question on the sheet; one export at a
    time per window; songs over 10 minutes are refused before rendering with a message.
  - Verify: `npm run e2e` (e2e R6.a with the delayed-read and rejected-resume hooks, R7.a, R7.b with RIFF/WAVE header
    and duration checks); `npm test` (`tests/unit/tracker.test.ts` for the 10-minute limit).
  - Files: `src/apps/tracker/main.ts`, `tests/e2e/quick-tools-music.spec.ts`, `tests/unit/tracker.test.ts`.
- [x] **T6** Notes: document, save and Escape to the window (R9, R10)
  - Acceptance: Notes opens with an empty `untitled.txt`; the caret enters it only when the visitor activates Notes.
    Save and Save As download under `untitled.txt`, a typed name, or an opened file's own name. Open… loads the listed
    text formats up to 1 MiB. Escape moves focus from the editor to the Notes window region; Tab and Shift+Tab then
    continue sheet navigation; inside the editor Tab still inserts spaces.
  - Verify: `npm run e2e` (e2e R9.a, R10.a).
  - Files: `src/apps/writer/main.ts`, `tests/e2e/quick-tools-notes.spec.ts`.
- [x] **T7** Card icons, reload reset and downloads in all browsers (R11, R12, R13)
  - Acceptance: a card Quick tools icon moves the view to the tool, starts it once if needed and makes it the active
    app. After a reload, drawing, song, note and changed settings are back to defaults. PNG, TRK, WAV and TXT
    downloads work in Chromium, Firefox and WebKit, with the 002 fallback link where a browser does not start them.
  - Verify: `npm run e2e` (e2e R11.a, R12.a); `npm run e2e:all` (e2e R13.a: the R4.a, R7.a/b and R9.a download
    checks in the Firefox and WebKit projects).
  - Files: `src/sheet/main.ts`, `tests/e2e/quick-tools.spec.ts`, `tests/e2e/quick-tools-paint.spec.ts`,
    `tests/e2e/quick-tools-music.spec.ts`, `tests/e2e/quick-tools-notes.spec.ts`.
- [x] **T8** Mock comparison and old-OS check (R2, R14)
  - Acceptance: compare-vs-mock against v0.7 for the Quick tools area (1440 × 900 and 390 × 844, light and dark, start
    view and after Reset) lists only reasoned differences. All sheet-only code is behind `env.DISPLAY === "sheet"`.
  - Verify: `docs/review/spec-004-mock-vs-build.md`; `npm run e2e` (R14.a, `tests/e2e/extras.spec.ts` on `/`).
  - Files: `docs/review/spec-004-mock-vs-build.md`.
- [x] **T9** Implementation review
  - Acceptance: Codex read-only review of the 004 diff saved to `docs/review/spec-004-impl-review-codex.md` with
    dispositions; accepted fixes done; status set to `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R14 all mapped.
