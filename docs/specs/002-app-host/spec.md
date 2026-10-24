# 002: App host (run the existing apps in sheet windows)

**Status:** Archived 2026-10-24 (spec 007 T7; living docs updated); was Verified (local) 2026-10-23 (T1–T9, branch `spec-002-host`); Approved · **Owner approval:** 2026-10-22 · **Gates needed:** none
**Related:** spec 001 (the sheet; its R2.b allows registered lazy app imports); specs 003 (CastleSiege) and 004 (Quick
tools) use this host; `src/sdk/os.d.ts`; OWNER_QUESTIONS 2026-10-22; critique
`docs/review/spec-002-critique-codex.md` (17 findings, all accepted).

## Why

CastleSiege, Paint, Tracker (Music) and Writer (Notes) are complete apps written against one interface, `OS` in
`src/sdk/os.d.ts`. Each starts with `export default async function main(os: OS)` (`src/apps/castlesiege/main.ts:127`,
`paint/main.ts:142`, `tracker/main.ts:80`, `writer/main.ts:26`). [Code] Today the kernel, filesystem image and window
server supply that interface, and that is what makes the site slow. This spec supplies the same interface from a
small host on the sheet page, so the apps run in sheet windows with as few changes as possible, and each app's code
loads only when needed. Which apps run, their sizes and their content are specs 003 and 004.

## Terms

- **App px:** the logical units an app works in. The old OS draws 1 app px as `--u` CSS px and returns that value
  from `scale()` (`src/wm/wm.ts:196-199`, `src/wm/window.ts:179-183`). [Code] On the sheet, `--u` = 1 px (owner, 2026-10-22: scale 1,
  16 px app text), so 1 app px = 1 sheet px. **Sheet px** and **screen px:** as in spec 001. Sheet zoom maps sheet px to screen px and is not
  part of app scale.
- **Main window:** the first window an app creates. **Child window:** any later `createWindow` call (dialogs).
- **Active app:** the app that owns keyboard focus. At most one at a time.

## Assumptions

1. The four apps and `src/apps/lib/*` use these `OS` members (observed by a scan, 2026-10-22, and Codex's scan):
   `app.id`, `app.name`, `app.version`, `argv`, `env.DISPLAY`, `env.DISPLAY_POLICY` (live, with `sys:policy`
   events), `pid`, `log`; `fs.readText`, `readFile`, `writeFile`, `readdir`, `stat`, `exists`, `mkdir`, `resolve`;
   `proc.spawn`, `list`, `onSignal`; `ui.createWindow`, `alert`, `confirm`, `choose`, `prompt`, `notify`,
   `openFile`, `saveFile`; `bus.publish`, `subscribe`; `sys.theme` (`get`, events `sys:theme`), `sys.sound`,
   `sys.openExternal`. Window methods: `setTitle`, `setMenu`, `setSize`, `setPosition`, `focus`, `close`,
   `onClose`, `onResize`, `onFocus`. T1 confirms the list with a type-checked host and a runtime trap that logs any
   other member an app touches.
2. `openFile` and `saveFile` return **paths**, not bytes (`src/sdk/os.d.ts:115-123`). The apps then read or write
   through `fs` (`src/apps/writer/main.ts:197-211`, `src/apps/paint/main.ts:1063`). [Code]
3. Apps need these resources (observed): `/etc/themes/{default,night}.json`, `/etc/associations.json`,
   `/apps/<id>/manifest.json` (built from `src/apps/<id>/manifest.json`, `scripts/build-image.ts:127`),
   `/usr/share/icons/*` (`src/ui/icons.ts:7-35`), `~/.config/<app>.json`, and app content such as
   `/home/guest/Music/demo.trk` (`src/apps/tracker/main.ts:504-510`) and `/usr/share/music/castlesiege-*.trk`
   (`src/apps/castlesiege/music.ts:6-7`). App content belongs to 003/004.
4. App styles rely on parts of `src/ui/base.css` and `src/wm/wm.css` (dialogs at `wm.css:442`) that also touch
   `html`, `body`, `.dpos` and generic classes (`.row`, `.app`, `.hidden`, `.win`). [Code] They must be scoped.
5. Some app code reads `scale()` and `clientWidth` (`src/apps/paint/main.ts:652`, `castlesiege/main.ts:308`) and
   `reducedMotion()` from `document.documentElement.dataset.motion` (`src/ui/dom.ts:80`). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | A host builds one `OS` object per app with exactly the members of assumption 1, typed against `src/sdk/os.d.ts`. Any other member throws an error that names it. | [Prop] | unit | — |
| R2 | The main window uses the app's demo area. `setTitle` sets the title bar. `setSize` sets the demo area in app px within the layout's limits. `onResize` reports app px. `focus` makes the app active and brings its window to the front. `setPosition` is ignored (the sheet owns position). | [Prop] | unit + e2e | — |
| R3 | A child window (e.g. Paint "New Picture" `paint/main.ts:1091`, CastleSiege "New Game" `castlesiege/main.ts:925`) opens as a modal panel inside its owner's window, honours its size and minimum size, blocks input to the owner, returns focus to the owner when closed, and closing it never closes the app. | [Prop] | e2e | — |
| R4 | `alert`, `confirm`, `choose` and `prompt` open as modal panels inside the app's window. Esc: `confirm` → false, `choose` → last index, `prompt` → null. | [Prop] | unit + e2e | — |
| R5 | `setMenu` draws a menu row under the title bar. Submenus, separators, disabled items, checkmarks and radio groups work. Replacing the menu replaces the row. Keyboard shortcuts in the menu run once, only for the active app, after the app's own handlers, and never take native text-editing keys in a text field. | [Prop] | e2e | — |
| R6 | Files: `openFile` shows the browser picker, copies the chosen file to `~/Imports/<name>` in memory, and returns that path (cancel → null). `saveFile` returns `~/Downloads/<name>`. **Every app write to a document path downloads the bytes** with the file's base name; document paths are all paths except `~/.config/`, `/tmp/` and system paths. So Save downloads for new, opened and bundled documents alike. If the browser does not start the download (no user activation left), the window shows a "Download <name>" link the visitor can press. | [Prop] | unit + e2e | — |
| R7 | The memory filesystem holds the resource allowlist (assumption 3, from a build-time table with text and binary files) plus this visit's writes. Reload clears it. No visitor data goes into browser storage, and `/next` never opens the old OS's IndexedDB volume. | [Prop] | unit + e2e | — |
| R8 | The icon loader of `src/ui/icons.ts` is installed from the allowlist before any app starts, so buttons show their icons. | [Prop] | e2e | — |
| R9 | `bus`: messages reach every subscriber with the sender's pid; one subscriber that throws does not stop delivery to others; unsubscribe works. `proc.list` returns the running hosted apps. `proc.spawn("<hosted id>", argv)` starts that app if needed (passing `argv` on first start), moves the view to its window (spec 001 `panTo`), and resolves its pid. `spawn` of anything else rejects with an error that names the target. | [Prop] | unit + e2e | — |
| R10 | Close and stop: an `onClose` that returns false keeps the app open. A closed app ends once: its signal handlers run, its bus subscriptions are removed, open dialogs settle, and it leaves `proc.list`. Its window returns to the placeholder and does not restart until the visitor activates it. | [Prop] | unit + e2e | — |
| R11 | Lazy load: an app starts when its window rectangle (current position, any zoom) overlaps the view expanded by half a view width and height, or when the visitor activates it (click, tap, keyboard Enter on the placeholder, card navigation). One shared start promise per app: one `import()`, one `main()` call. A start in the background never takes focus or moves the view. | [Prop] | e2e | — |
| R12 | Start failure (import error, `main` throws, or throws after partial start) shows the error and "Try again" in the window. Try again cleans up as in R10 and starts once. Other windows keep working. | [Prop] | e2e | — |
| R13 | Styles: app and shared widget/dialog styles apply only inside a host root element per window. Old display and window-chrome rules are not loaded. Loading the apps in any order does not change the sheet's computed styles or geometry. | [Prop] | e2e | — |
| R14 | Theme: the host sets the old role variables on each host root (`default` in light, `night` in dark), answers `sys.theme.get()`, publishes `sys:theme` on a scheme change, and refreshes icons. `sys.theme.set` is a no-op. | [Prop] | e2e | — |
| R15 | Policy and scale: `env.DISPLAY` is `sheet` (the one marker apps use for sheet-only behaviour); `env.DISPLAY_POLICY` is `desktop`; `sys:policy` is never published. `--text-size` is 16 px. `--u` is 1 px and `scale()` returns 1 inside demo areas, at every sheet zoom. `overlayRoot()` returns the active app's host root. | [Prop] | unit + e2e | — |
| R16 | Motion: the host sets `document.documentElement.dataset.motion` from `prefers-reduced-motion` at start and on change, before any app starts. | [Prop] | e2e | — |
| R17 | Sound: `sys.sound.enabled()` is false (UI sound effects off). Audio the visitor starts on purpose still plays; if the browser keeps the audio context suspended, the app's play control stays usable for a second try. | [Prop] | e2e | — |
| R18 | Input: pointer and keyboard input inside a running app's demo area go to the app; only the title bar drags; the sheet never pans from inside a running app. Popups (menus) open inside the window at any zoom. | [Prop] | e2e | — |

### Acceptance

- **R1.a** A unit test calls each member of assumption 1 on a host with fixture apps. Calling `proc.kill` or
  `sys.reboot` throws an error whose message contains the member name.
- **R2.a** Given a fixture app, when it calls `setTitle("x")`, `setSize(300, 200)` and `focus()`, then the title is
  "x", the demo area is 300 × 200 app px (= sheet px), `onResize` received (300, 200) once, and its window is on top.
- **R3.a** Given Paint running, when File → New is chosen, then "New Picture" shows inside Paint's window, Paint's
  canvas does not take clicks, and Cancel returns focus to Paint with Paint still running.
- **R4.a** Given a fixture app, when it calls `choose("?", ["A","B","C"])` and Esc is pressed, then it resolves 2.
  When it calls `prompt` and Esc is pressed, then it resolves null.
- **R4.b** Given Tracker running, when the BPM prompt opens and is cancelled, then the tempo does not change. When a
  new value is entered, then the tempo is that value.
- **R5.a** Given Writer running and focus in its text, when ⌘/Ctrl + S is pressed, then Writer's Save runs once. With
  Paint also running in the background, Paint's Save does not run. ⌘/Ctrl + C in Writer's text copies text.
- **R5.b** Given a fixture menu with a submenu, a disabled item and a radio group, then the submenu opens, the
  disabled item does nothing, and choosing a radio item unchecks the others.
- **R6.a** Given Writer with text "hello", when File → Save As is used and a name `n.txt` given, then the browser
  downloads `n.txt` with bytes `hello` (Playwright `download` event). When the text changes and File → Save is used,
  then a second download of `n.txt` has the new bytes. Given a file opened with Open…, Save downloads it under its
  own name. Given a fixture app that writes `~/.config/x.json`, then nothing downloads.
- **R6.c** Given automatic downloads blocked (test hook), when an app saves, then a "Download <name>" link shows and
  pressing it downloads the bytes.
- **R6.b** Given Paint, when File → Open is used with a fixture PNG, then Paint shows the image. When the picker is
  cancelled, then Paint shows no error.
- **R7.a** Given an app writes `~/.config/paint.json`, when the page reloads, then the file is gone, and
  `localStorage`, `sessionStorage` and IndexedDB of the origin hold no data from `/next`.
- **R8.a** Given Paint running, then its tool buttons draw their icons (non-empty image source).
- **R9.a** Given two fixture apps A and B, when A publishes on topic t, then B receives the message with A's pid; a
  throwing subscriber does not stop B; after unsubscribe, B receives nothing.
- **R9.b** Given a fixture app calls `proc.spawn("writer", ["--readonly", "/x.md"])` with Writer not running, then
  Writer starts once with that `argv`, the view moves to Writer's window, and the call resolves Writer's pid.
- **R10.a** Given Writer with unsaved text, when its window closes, then Writer asks to save; on Cancel, Writer stays
  open with its text.
- **R10.b** Given Tracker playing, when its window closes, then playback stops, Tracker leaves `proc.list`, and its
  window shows the placeholder.
- **R11.a** Given 1440 × 900 at the start view, then exactly the apps whose windows overlap the expanded view have
  started (by `main()` count), and no other `app-*` JS or CSS was requested. Given the view moves to Music, then
  Tracker starts once (one request, one `main()` call), and focus stays where it was.
- **R11.b** Given fit zoom, when every window overlaps the view, then every app starts once and the page stays
  responsive.
- **R12.a** Given a fixture app that throws in `main`, then its window shows the error and Try again; another window
  can still be thrown. Given a fixture that fails once then works, Try again starts it once.
- **R13.a** Given screenshots and computed styles of the card, a window frame and the grid before any app starts,
  when all four apps start in two different orders, then those values are unchanged.
- **R14.a** Given dark scheme, when Paint starts, then Paint's toolbar, canvas frame and text use the night roles
  (assert computed colours). When the scheme changes to light while it runs, then the colours change and the
  drawing stays.
- **R15.a** Given zoom 50 %, when Paint's canvas is clicked at a pixel, then that pixel is painted; when a menu
  opens, then it is fully inside the window.
- **R16.a** Given reduced motion before load, then `dataset.motion` is set before the first app starts; given the
  preference changes, then it updates.
- **R17.a** Given CastleSiege running, when a piece moves, then no UI sound plays. Given Tracker, when Play is
  pressed on a cold load, then audio plays or the Play control stays usable (owner check for real sound: Chromium
  only; Safari **Unverified**).
- **R18.a** Given Paint running, when the visitor drags on its canvas, then Paint draws and the sheet does not pan.

## Approach

- **Files.** `src/sheet/host/`: `os.ts` (OS per app), `window.ts` (main window, child panels, menu row, dialogs),
  `fs.ts` (memory fs + `/downloads/` rule), `resources.ts` (generated allowlist table, text and binary), `load.ts`
  (registry of hosted app ids → `import("../../apps/<id>/main.ts")`, one start promise each), `styles.ts` (scoped
  loading). `src/ui/dom.ts`: let `scale()` and `overlayRoot()` read host-set values when `#display` is absent (small
  change, old OS unaffected).
- **Styles.** Wrap app and widget CSS under a host root class (build step or `@scope`), drop the `html`, `body`,
  `.dpos` and window-chrome rules, and rename the sheet's own `.win` to avoid the clash with `wm.css:62`.
- **Reuse.** `src/ui/menu.ts` and `src/ui/widgets.ts` where they work under the host root; the old window server's
  shortcut matcher (`src/wm/wm.ts:1231-1239`) logic, moved into the host.
- **App changes** are not in 002. Known ones are assigned: Paint two-finger pan at zoom, Paint "Use as wallpaper",
  Writer Run, Writer Help/manual → 004; CastleSiege Help/lesson actions, victory-music rule, animations → 003.
- **Rejected:** iframes per app (heavier, theming, focus and zoom across frames); rewriting the apps; booting the
  kernel on the sheet.

## Boundaries

- **Always:** keep the old OS at `/` working (its e2e passes); keep app source unchanged in 002 except
  `src/ui/dom.ts` as above and the popup placement in `src/ui/menu.ts` (`popupMenu` positions in the overlay root's
  own px, allowing for the root's page offset and zoom factor, and focuses with `preventScroll`; on the old OS the
  root sits at the page origin with no zoom, so positions there are unchanged). (Advisor amendment 2026-10-23.)
- **Ask first:** any app behaviour change; a new dependency.
- **Never:** put visitor data in browser storage; load `system.img.json`; boot the kernel on `/next`; run arbitrary
  JavaScript (Writer Run stays unsupported).

## Out of scope

- App choice, sizes, starting content, songs, and per-app fixes (003, 004).
- Other old-OS apps (file manager, settings, reader, guide, terminal).

## Open questions

- None. R14 (theme mapping) and R17 (UI sounds off) follow the recruiter-first decisions; the owner can change them
  at review.

## Approval record

2026-10-22 — Owner approved this spec as written ("Approve all", together with 001 Amendment 1 and specs 002–007),
including the proposals named in it. No gate is approved by this.

## Lead notes (overnight run)

2026-10-23 — T1 confirmed assumption 1 by scan and a type-checked host (as the assumption asks). Corrections, no
requirement change: windows also expose `id` and `root` (all four apps use `win.root`; both are part of the SDK
`Window`); `sys.sound` exposes only `enabled()` (the only member the apps call). Codex confirmed both by scan
(`docs/review/spec-002-t1-review-codex.md`). T8's runtime trap log is the final check.
2026-10-23 — T2: `saveFile` returns the absolute `/home/guest/Downloads/<name>` (the same path as `~/Downloads/<name>`,
expanded).
2026-10-23 — T3: the 001 R22 budget now counts every JS/CSS asset `/next` can load, registered apps included
(Codex 002 T3 #7): 82.8 KiB gzip of 100 at T3. A later spec that pushes it over must decide (advisor or owner).
2026-10-23 — T3 note for the owner / spec 004: `setTitle` sets the sheet window's title bar (R2), so Paint, Tracker
and Writer replace the mock's bar text ("quick paint", "music maker", "notes.txt") with their own titles
("Paint - untitled", …). CastleSiege does not call it.
2026-10-23 — T6: `sys.theme.set` is a no-op that resolves (R14), so it is part of the host's members; T1's unit
test now checks `sys.theme.list` as an unlisted member instead.
2026-10-23 — Decided by the Fable advisor for the owner (T5): accept the `src/ui/menu.ts` popup-placement change
(option A); Always boundary amended above. Reason: with the old OS's root at the page origin and zoom 1, the new
formula reduces to the old one (advisor read the diff); option B (host-side override) would duplicate placement
logic; option C fails R15.a/R18. Conditions: the old-OS e2e stays green; a unit test for `popupMenu` with an
offset, zoomed root. Owner to confirm.
2026-10-23 — T5: keyboard way out of a running app (for 001 R19, Codex 002 T5/T7 #4): Esc, then Tab or Shift+Tab,
moves focus from the app to its window frame (an Esc the app handles does not count). Documented in
`src/sheet/host/window.ts`. The menu row (27 px) sits inside the demo area, so each app's area is 27 px shorter;
003/004 may raise the window heights in the layout table.
2026-10-23 — T7: apps close through their own File → Close (`win.close()`); the sheet window has no close button
(owner may decide to add one).
2026-10-23 — T8: assumption 1 confirmed at runtime: with all four apps started and every menu and submenu opened,
`trapLog()` is empty in Chromium, Firefox and WebKit. R7.a reading: Paint rewrites `~/.config/paint.json` at start,
so the test checks that the previous visit's setting is gone and browser storage is empty. The "Download <name>"
link shows after every document save (the browser gives no signal that an automatic download started).
