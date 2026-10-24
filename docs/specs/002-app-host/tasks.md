# 002 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Start after 001 is `Verified (local)`.

- [x] **T1** Host `OS` object and member trap (R1, R15)
  - Acceptance: `src/sheet/host/os.ts` builds one `OS` per app with exactly the members of assumption 1, typed
    against `src/sdk/os.d.ts`. Any other member throws an error that names it. A runtime trap logs every other member
    an app touches (T8 uses it to confirm assumption 1). `env.DISPLAY` is `sheet`, `env.DISPLAY_POLICY` is
    `desktop`, and `sys:policy` is never published. `src/ui/dom.ts`: when `#display` is absent, `scale()` returns the
    host value 1 and `overlayRoot()` returns the active app's host root. The old OS is unchanged.
  - Verify: `npm test` (unit R1.a; unit part of R15: env values, `scale()` = 1); `npm run e2e` (existing old-OS
    suite passes).
  - Files: `src/sheet/host/os.ts`, `src/ui/dom.ts`, `tests/unit/host-os.test.ts`, `tests/fixtures/host/` (fixture
    apps).
- [x] **T2** Memory filesystem, resources and the download rule (R6, R7)
  - Acceptance: `fs.ts` holds the resource allowlist of assumption 3 from a build-time table (text and binary) plus
    this visit's writes. A write to a document path downloads the bytes under the base name; writes under
    `~/.config/`, `/tmp/` and system paths do not. `openFile` copies the chosen file to `~/Imports/<name>` (cancel →
    null). `saveFile` returns `~/Downloads/<name>`. A test hook can block the automatic download, and then the
    "Download <name>" link is shown. No browser storage and no IndexedDB open.
  - Verify: `npm test` (unit: document-path rule, `openFile`/`saveFile` paths and cancel, binary resource bytes,
    fallback-link hook). The e2e checks R6.a–c and R7.a run in T8 with real apps.
  - Files: `src/sheet/host/fs.ts`, `src/sheet/host/resources.ts`, `vite.config.ts` (resource-table step),
    `tests/unit/host-fs.test.ts`.
- [x] **T3** Main window and lazy load (R2, R11, R12)
  - Acceptance: `load.ts` registers `castlesiege`, `paint`, `tracker` and `writer` (plus fixture apps in test builds
    only) as `import("../../apps/<id>/main.ts")`, with one shared start promise each. An app starts when its current
    rectangle overlaps the view expanded by half a view width and height, at any zoom, or on activation (click, tap,
    Enter on the placeholder, card navigation). A background start never takes focus or moves the view. The main
    window uses the demo area: `setTitle`, `setSize` (app px, within the layout limits), `onResize`, `focus`;
    `setPosition` is ignored. A start failure shows the error and "Try again"; Try again cleans up and starts once.
    The 001 R2.b guard accepts only these registered lazy imports and still fails on its fixture. The 001 R2.a e2e
    is updated so that only registered app chunks of eligible windows may load.
  - Verify: `npm test` (unit part of R2.a); `npm run e2e` (e2e R2.a, R11.a, R11.b, R12.a; updated 001 R2.a);
    `npm run build` with the forbidden-import fixture still failing.
  - Files: `src/sheet/host/load.ts`, `src/sheet/host/window.ts`, `src/sheet/main.ts`, `vite.config.ts`,
    `tests/e2e/host-load.spec.ts`, `tests/e2e/sheet.spec.ts`.
- [x] **T4** Child panels and dialogs (R3, R4)
  - Acceptance: a child window opens as a modal panel inside its owner's window, honours its size and minimum size,
    blocks input to the owner, returns focus to the owner when closed, and never closes the app. `alert`, `confirm`,
    `choose` and `prompt` open as modal panels in the app's window. Esc: `confirm` → false, `choose` → last index,
    `prompt` → null.
  - Verify: `npm test` (unit R4.a); `npm run e2e` (e2e R3.a with Paint, R4.a, R4.b with Tracker).
  - Files: `src/sheet/host/window.ts`, `src/ui/widgets.ts` (reuse only, no behaviour change),
    `tests/unit/host-dialogs.test.ts`, `tests/e2e/host-window.spec.ts`.
- [x] **T5** Menu row, shortcuts and input routing (R5, R18)
  - Acceptance: `setMenu` draws a menu row under the title bar with submenus, separators, disabled items, checkmarks
    and radio groups; a new menu replaces the row. Shortcuts run once, only for the active app, after the app's own
    handlers, and never take native text-editing keys in a text field (matcher logic moved from
    `src/wm/wm.ts:1231-1239`). Pointer and keyboard input in a running app's demo area go to the app; only the title
    bar drags; the sheet never pans from inside a running app. Menus open inside the window at any zoom.
  - Verify: `npm run e2e` (e2e R5.a, R5.b, R18.a).
  - Files: `src/sheet/host/window.ts`, `src/sheet/host/shortcuts.ts`, `src/sheet/gestures.ts`,
    `tests/e2e/host-input.spec.ts`.
- [x] **T6** Scoped styles, theme, scale and motion (R13, R14, R15, R16)
  - Acceptance: app, widget and dialog CSS apply only under a host root per window; the `html`, `body`, `.dpos` and
    window-chrome rules are not loaded; the sheet's `.win` class is renamed. The host sets the old role variables on
    each host root (`default` light, `night` dark), answers `sys.theme.get()`, publishes `sys:theme` on a scheme
    change and refreshes icons; `sys.theme.set` does nothing. `--text-size` is 16 px and `--u` is 1 px in demo areas
    at every zoom. `dataset.motion` follows `prefers-reduced-motion` before any app starts and on change.
  - Verify: `npm run e2e` (e2e R13.a, R14.a, R15.a, R16.a); `npm run e2e:all` Firefox and WebKit projects for R13.a.
  - Files: `src/sheet/host/styles.ts`, `src/sheet/host/os.ts`, `src/sheet/sheet.css`, `vite.config.ts`,
    `tests/e2e/host-styles.spec.ts`.
- [x] **T7** Bus, processes and close (R9, R10)
  - Acceptance: `bus` delivers to every subscriber with the sender's pid; a throwing subscriber does not stop
    others; unsubscribe works. `proc.list` returns running hosted apps. `proc.spawn("<hosted id>", argv)` starts the
    app if needed (with `argv` on first start), calls 001 `panTo` and resolves its pid; any other target rejects
    with its name. `onClose` returning false keeps the app. A closed app ends once: signal handlers run,
    subscriptions go, open dialogs settle, it leaves `proc.list`, and its window shows the placeholder until
    activated.
  - Verify: `npm test` (unit R9.a); `npm run e2e` (e2e R9.b, R10.a, R10.b).
  - Files: `src/sheet/host/os.ts`, `src/sheet/host/load.ts`, `tests/unit/host-bus.test.ts`,
    `tests/e2e/host-proc.spec.ts`.
- [x] **T8** Real-app files, icons and sound (R1, R6, R7, R8, R17)
  - Acceptance: the `src/ui/icons.ts` loader is installed from the allowlist before any app starts.
    `sys.sound.enabled()` is false; audio the visitor starts still plays, or the play control stays usable when the
    audio context stays suspended. Save, Open and the fallback link work with Writer and Paint. Reload clears the
    memory fs and leaves no data in browser storage. The member trap logs no unlisted member while the four apps
    start and run their menus (assumption 1 confirmed; record the result in the ledger).
  - Verify: `npm run e2e` (e2e R6.a, R6.b, R6.c, R7.a, R8.a, R17.a); `npm run e2e:all` (Firefox and WebKit projects
    for R6.a); R17.a real-sound owner check in Chromium only, Safari **Unverified**.
  - Files: `src/sheet/host/os.ts`, `src/sheet/host/resources.ts`, `tests/e2e/host-files.spec.ts`,
    `tests/fixtures/host/`.
- [x] **T9** Implementation review
  - Acceptance: Codex read-only review of the 002 diff saved to `docs/review/spec-002-impl-review-codex.md` with
    dispositions; accepted fixes done; status set to `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all` (old-OS suite included).
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R18 all mapped.
