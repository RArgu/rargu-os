# 004: Quick tools (Paint, Music, Notes)

**Status:** Archived 2026-10-24 (spec 007 T7; living docs updated); was Verified (local) (mock v0.7 approved 2026-10-24; branch `spec-004-tools`); Approved · **Owner approval:** 2026-10-22 · **Gates needed:** none
**Related:** specs 001 (Quick tools icons, layout table), 002 (app host: R6 save-downloads, R15 sheet marker and
16 px text, R17 sound); OWNER_QUESTIONS 2026-10-22 (Quick tools, Music = real Tracker with a demo song, icons take
the view to the tool, app scale 1); critique `docs/review/spec-004-critique-codex.md` (13 findings, all accepted).

## Why

The owner uses Paint a lot and wants small, working tools on the sheet: draw and save a PNG, make music and export a
WAV, write a note and save it as a `.txt`. These are the existing Paint, Tracker and Writer apps, run through the
app host (002), with the few changes the sheet needs.

## Assumptions

1. Manifest sizes are the client area: Paint 430 × 286, Tracker 552 × 284, Writer 420 × 300 app px (= sheet px at
   scale 1) (`src/apps/*/manifest.json`, `src/wm/window.ts:179-183`). [Code]
2. Tracker hides its side panel below 470 app px (`tracker/main.ts:1197`); it starts `openDemo()` without waiting
   (`:1245`) and loading a song resets playback (`:482`). [Code]
3. Tracker's WAV export asks a second "Download the WAV to this device too?" question (`tracker/main.ts:596-601`).
   [Code]
4. Paint opens PNG files up to 800 × 800 (`paint/main.ts:1009`, `:1078-1080`); Writer opens its listed text formats
   up to 1 MiB (`writer/main.ts:18-19`, `:160`) and Save As keeps an opened file's base name (`:201`). [Code]
5. Writer turns Tab and Shift+Tab into spaces (`writer/main.ts:445-449`). [Code]
6. Each app sets its title to its name, file name and modified marker (`paint/main.ts:683`, `tracker/main.ts:1036`,
   `writer/main.ts:136`). [Code]
7. Items that need the old OS: Paint wallpaper items (`paint/main.ts:383`, `:1210`), Writer Run (`writer/main.ts:359`),
   manual/Guide Help items (`src/apps/lib/open.ts:163`). [Code]
8. A maximum-length song (128 orders × 32 rows at 40 BPM, `tracker/engine.ts:11-14`) needs about 258 MiB of samples
   plus 129 MiB of WAV (Codex 004 #12, derived). Export has no in-progress guard (`tracker/main.ts:571`). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Paint, Music (Tracker) and Notes (Writer) run in the Quick tools windows through the 002 host. Card labels are Paint, Music, Notes. On the sheet, window titles start with those names and keep the file name and modified marker. | [Prop] | e2e | — |
| R2 | Layout: client areas equal the manifest sizes; outer rectangles (with title bar and menu row) are inside 3000 × 1640, do not overlap each other or any project window at home, and every control is reachable. T1 writes the proposed rectangles into the 001 layout table and mock v0.7 for the owner to review before code beyond T1. | [Prop] | e2e + compare-vs-mock | — |
| R3 | Existing features stay, except the removed items (R8). Retained menus are listed in T1 (including Paint's Export to Downloads, Tracker's instrument and pattern editing, Writer's Find/Replace and view settings). | [Prop] | e2e | — |
| R4 | Paint opens with a blank 320 × 200 canvas. Save / Save As / Export download a `.png`. Open… loads a PNG up to 800 × 800; a larger or invalid file shows Paint's error and keeps the current picture. | [Prop] | e2e | — |
| R5 | Paint two-finger canvas pan follows the fingers at any sheet zoom, until the canvas scroll limit. | [Prop] | e2e (mobile) | — |
| R6 | Music is ready only after the bundled demo (`system/home/guest/Music/demo.trk`) has parsed; Play is disabled until then. One Play activation starts playback when the browser allows audio; otherwise Play stays usable for a retry (002 R17). | [Prop] | e2e | — |
| R7 | Music: Save / Save As download a `.trk` (the demo saves as `demo.trk`); Open… loads a `.trk`; Export WAV… downloads one `.wav` and does not ask the second download question on the sheet. Only one export runs per window. Songs longer than 10 minutes are refused before rendering, with a message. | [Prop] | e2e | — |
| R8 | Removed on the sheet: Paint wallpaper items, Writer Run, manual and Guide Help items. Each Help menu has exactly one item, About, which works, also after a menu rebuild. | [Prop] | e2e | — |
| R9 | Notes opens with an empty `untitled.txt` document; the caret goes into it only when the visitor activates Notes. Save / Save As download the document under its name (`untitled.txt`, a typed name, or an opened file's own name). Open… loads its listed text formats up to 1 MiB. | [Prop] | e2e | — |
| R10 | Keyboard: in Notes, Escape moves focus from the editor to the Notes window region; then Tab and Shift+Tab continue sheet navigation. Inside the editor, Tab still inserts spaces. | [Prop] | e2e | — |
| R11 | Card Quick tools icons (001 R12) move the view to the tool and activate it (start it if needed). | [Prop] | e2e | — |
| R12 | After a reload, drawings, songs, notes and changed settings are back to their defaults (002 R7). | [Prop] | e2e | — |
| R13 | Downloads (PNG, TRK, WAV, TXT) work in Chromium, Firefox and WebKit, with the 002 fallback link when a browser does not start them. | [Prop] | e2e (all three) | — |
| R14 | All sheet-only behaviour is gated on `os.env.DISPLAY === "sheet"`. The old OS apps are unchanged at `/`. | [Prop] | e2e | — |

### Acceptance

- **R1.a** Given Notes after typing, then its title starts with "Notes" and shows the modified marker; after Save,
  the marker is gone.
- **R2.a** Given the build, then each client area equals its manifest size (± 1 px), each outer rectangle is inside
  the sheet, and no two home rectangles overlap.
- **R4.a** Given Paint, when a red stroke is drawn from (20, 20) to (100, 20) and Save As `a.png` is used, then
  `a.png` decodes as 320 × 200 with red pixels at (60, 20) and white at (60, 100).
- **R5.a** Given a 640 × 400 picture at Paint zoom 2, scrolled away from its limits, at sheet zoom 60 %, 100 % and
  160 %, when two fingers move 100 screen px left, then the picture moves 100 ± 2 screen px left, its pixels do not
  change, and the sheet view does not move.
- **R6.a** Given the demo read delayed by 1 s (test hook), then Play is disabled until the demo has parsed; then the
  song has the demo's tempo and first-pattern notes, and Play starts the position advancing within 1 s with non-zero
  audio samples (Chromium analyser). Given audio resume rejected (test hook), then Play stays enabled and a second
  press retries.
- **R7.a** Given the demo edited (one note changed), when Save is used, then `demo.trk` downloads; when it is opened
  again, then the changed note is there.
- **R7.b** Given Export WAV… confirmed, then exactly one `.wav` downloads, its RIFF/WAVE header is valid, its PCM
  samples are not all zero, and its duration matches the song length plus the renderer's 0.5 s ring-out ± 0.1 s
  (lead clarification 2026-10-24, T4–T6 review finding 7). Given the file-name step cancelled,
  then nothing downloads. Given a second Export pressed during rendering, then it does not start.
- **R8.a** Given each app's Help menu, then it has one item, About, and it opens. No menu item contains "Wallpaper"
  or "Run".
- **R9.a** Given Notes, when "hello" is typed and File → Save is used, then `untitled.txt` downloads with bytes
  `hello`.
- **R10.a** Given text typed in Notes, when Escape and then Tab are pressed, then focus leaves Notes and the text is
  unchanged.
- **R11.a** Given Music not started and the view elsewhere, when the card's Music icon is pressed, then the view
  centres on Music, Music starts once and is the active app.
- **R12.a** Given a drawing, an edited song, a note and Writer's word-wrap changed, when the page reloads, then all
  four are back to defaults.
- **R13.a** The R4, R7 and R9 download checks pass in Chromium, Firefox and WebKit.
- **R14.a** The existing old-OS e2e for Paint, Tracker and Writer (`tests/e2e/extras.spec.ts`) passes.

## Approach

- Register `paint`, `tracker` and `writer` in the 002 host. Resources: `/home/guest/Music/demo.trk` and the icons the
  apps use.
- App changes gated on `env.DISPLAY === "sheet"`: title prefixes; remove wallpaper, Run and manual/Guide Help items
  and add About where missing; Tracker waits for the demo before enabling Play, skips the second WAV question, guards
  concurrent export, refuses songs over 10 minutes; Writer Escape-to-window; Paint two-finger pan divides screen
  deltas by the sheet zoom the host exposes.
- Layout: measure at scale 1 in T1, place the three windows as a cluster in the Quick tools area, update the 001
  layout table, build mock v0.7, stop for the owner's review of the mock.
- `docs/spec/WRITER-EXPORT.md` (a separate Export item) stays deferred for the old OS; the sheet uses Save / Save As.
- **Rejected:** new small tool apps (owner chose the real apps).

## Boundaries

- **Always:** keep the old OS versions of the three apps working at `/`.
- **Ask first:** any app feature change beyond this spec; the 10-minute export limit if T1 shows a smaller limit is
  needed.
- **Never:** store drawings, songs or notes in browser storage.

## Out of scope

- A drum-grid toy (owner chose the real Tracker). The terminal (removed). Writer Export (deferred).

## Open questions

- None. The 10-minute WAV limit is a proposal [Prop]; the owner can change it at review.

## Approval record

2026-10-22 — Owner approved this spec as written ("Approve all", together with 001 Amendment 1 and specs 002–007),
including the proposals named in it. No gate is approved by this.

## Owner decisions after T1

2026-10-24 — Owner approved mock v0.7 (proposed rectangles: Paint 1920, 760, 434 × 350; Music 2400, 700, 556 × 348;
Notes 1920, 1150, 424 × 364). The build's CastleSiege is 654 px (003 T8), not v0.7's 658.
2026-10-23 — Owner: in Notes, Escape alone moves focus out of the editor (R10 as written); the 002 host's Esc-then-Tab
route stays for the other apps.
2026-10-24 — Owner: the 001 R22 budget is 150 KiB gzip (performance before size).
2026-10-24 — **Owner:** WAV export is capped at 90 s on the sheet (was 10 minutes in R7): the host's 8 MiB file limit
fits ~94 s, and a 10-minute render takes ~2 minutes. Longer songs are refused before rendering with a message.
2026-10-24 — Lead note (T4): R5 says Paint uses "the sheet zoom the host exposes"; Paint measures it itself on the
sheet (the view's screen width ÷ layout width, which equals the sheet zoom), so no new app-facing member is needed.
2026-10-24 — Lead note (T6): Esc alone in Notes is done inside Writer (sheet only); the host's Esc-then-Tab route
stays for the other apps; two host-input tests that encoded the old Writer behaviour were updated.
