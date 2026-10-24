# Spec 002 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166d5-51f8-7901-b29e-2972b37fbee4 · **Tokens:** 266,083
- **Date:** 2026-10-22 · **Commit:** c3af2d4

## Dispositions

Checked by Claude: `src/sdk/os.d.ts:104-124` (paths, not bytes; `choose` Esc rule), `paint/main.ts:1091` and
`castlesiege/main.ts:925` (child windows), `writer/main.ts:128` (`textContent` is a DOM property, not `OS`),
`tracker/main.ts:509-510` and `castlesiege/music.ts:6-7` (songs), `kernel.ts:569` (`DISPLAY_POLICY`). All confirmed.

| # | Sev | Disposition | Change |
|---|---|---|---|
| 1 | High | Accepted | R6: paths + memory fs + `/downloads/` write rule. |
| 2 | High | Accepted | R3: child windows as modal panels. |
| 3 | High | Accepted | Assumption 1 corrected (`prompt` in, `textContent` out, nested members listed); R4.b. |
| 4 | High | Accepted | Spec 001 R2.b amended; R11 uses a registry. |
| 5 | High | Accepted | R13: scoped styles; sheet `.win` renamed. |
| 6 | High | Accepted | R5: one active app; shortcuts once; native edit keys kept. |
| 7 | High | Accepted | R10, R12: close veto, cleanup, retry. |
| 8 | High | Accepted | Assumption 3 + R7, R8: resource allowlist, icon loader; songs to 003/004. |
| 9 | Medium | Accepted | Terms (app px); R2, R15. |
| 10 | Medium | Accepted | R15.a, R18; Paint two-finger pan assigned to 004. |
| 11 | Medium | Accepted | R17; CastleSiege victory music to 003. |
| 12 | Medium | Accepted | R14 with computed-colour checks. |
| 13 | Medium | Accepted | R16. |
| 14 | Medium | Accepted | R9 spawn rules; Writer Run, Help, Wallpaper assigned to 003/004. |
| 15 | Medium | Accepted | R11: geometry rule, one start promise, `main()` counts. |
| 16 | Medium | Accepted | Acceptance checks rewritten to assert state, data or counts. |
| 17 | Low | Accepted | R7 wording; storage check in R7.a. |

## Codex output (verbatim)

Spec 002 needs revision before approval. The main blockers are the file contract, additional windows, shared UI dependencies, and its conflict with spec 001.

**Observed** evidence below comes from `nl -ba`, `rg -n`, `rg --files`, and a whitespace-tolerant Python scan of OS accesses. **Derived** describes consequences of that code. Browser-specific risks remain **Unverified**.

1. **High — R5 cannot support the unchanged apps.** [spec.md:39](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:39)

   **Observed:** Both file methods return `Promise<string | null>` (`src/sdk/os.d.ts:115`). Writer receives a path, then reads or writes through `fs` (`src/apps/writer/main.ts:197`, `:211`). Paint follows the same pattern (`src/apps/paint/main.ts:1063`). `saveFile` receives no bytes.

   **Derived:** Returning bytes from `openFile` breaks callers. Downloading inside `saveFile` cannot save content that the app produces afterward.

   **Spec fix:** Replace R5 with: “`openFile` imports bytes into the shared memory filesystem and returns their path. `saveFile` returns a named destination path. A successful write to an export destination offers the resulting bytes for download.” Define subsequent Save behavior and distinguish export destinations from config writes. Replace R5.a with actual Writer and Paint Save/Open round trips, including cancellation and byte comparison.

2. **High — `createWindow` must support secondary modal windows.** [spec.md:28](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:28)

   **Observed:** Paint creates “New Picture” with `modal`, `resizable`, dimensions, and minimum dimensions (`src/apps/paint/main.ts:1091`). CastleSiege creates “New Game” (`src/apps/castlesiege/main.ts:925`). R2 maps every created window to the main demo area.

   **Derived:** A literal implementation places dialog content inside the main body. Closing that dialog could close the hosted app.

   **Spec fix:** State: “The main window uses the assigned demo area. Each modal creation returns a distinct child window inside its owner.” Define size constraints, parent input blocking, focus return, and cancellation. Test both real dialogs. For `choose`, require Escape to return the last button index, as the SDK specifies (`src/sdk/os.d.ts:108`).

3. **High — Assumption 1 omits `ui.prompt` and invents `os.textContent`.** [spec.md:18](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:18)

   **Observed:** Tracker calls `os.ui.prompt` across multiple lines for tempo entry (`src/apps/tracker/main.ts:661`). Assumption 1 omits it, although R4 includes it. The SDK has no `OS.textContent`; app occurrences are DOM assignments (`src/apps/writer/main.ts:128`).

   **Derived:** R1 permits rejecting a method that Tracker needs.

   **Spec fix:** Add `ui.prompt`, remove `textContent`, and list nested members explicitly. Record `app.id/name/version`, `env.DISPLAY_POLICY`, and the Window methods separately. `proc.list` is already listed, but needs a defined result. Add an acceptance check that edits BPM through the real prompt and cancels it without changing tempo.

4. **High — The lazy loader conflicts with spec 001’s build check.** [spec.md:45](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:45)

   **Observed:** Spec 001 checks static, dynamic, and preloaded chunks and rejects every module under `src/apps/` (`docs/specs/001-sheet/spec.md:66`). Spec 002 adds dynamic imports from that directory (`spec.md:78`).

   **Derived:** The required build check rejects the proposed implementation.

   **Spec fix:** Explicitly amend 001 R2.b for stage 002. Permit the registered app modules and their audited dependencies through lazy imports. Retain the bans on kernel, filesystem implementation, window server, and boot modules. Check the emitted module graph, including shared chunks and CSS. The naming function only recognizes app `main.ts` facades (`vite.config.ts:73`); filenames alone cannot prove that app code stayed unloaded.

5. **High — CSS isolation is missing, with a known class collision.** [spec.md:26](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:26)

   **Observed:** `base.css` changes `html/body` and defines global `.row`, `.app`, `.hidden`, and widget classes (`src/ui/base.css:3`, `:1318`). `.dpos` is a fixed viewport container (`:17`). Both the mock and `wm.css` define `.win` (`docs/mockups/rargu-os-src/part1.html:106`, `src/wm/wm.css:62`). Dialog layout lives in `wm.css` (`:442`).

   **Derived:** Importing these styles unchanged can alter the sheet. Adding `.dpos` to each demo would also make it a viewport container.

   **Spec fix:** Require scoped app styles and scoped shared widget/dialog styles. Exclude old display and window chrome rules. Define the host body’s positioning, sizing, inherited fonts, and box sizing. Add a regression check that loads all four apps in different orders and compares sheet geometry and styles before and afterward.

6. **High — R12 does not define focus or shortcut ownership.** [spec.md:46](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:46)

   **Observed:** Shortcut execution belongs to the window server, not `menu.ts` (`src/wm/wm.ts:1231`). Its matcher recurses through submenus and preserves native editing shortcuts (`:1239`). CastleSiege, Writer, and Tracker explicitly focus their content during startup (`src/apps/castlesiege/main.ts:1330`, `src/apps/writer/main.ts:514`, `src/apps/tracker/main.ts:1247`).

   **Derived:** Nearby lazy loads can steal focus. Independently registered document shortcuts can save or edit several apps. Copying the old Tab trap also conflicts with sheet navigation (`src/wm/wm.ts:1210`).

   **Spec fix:** Require one active app or child dialog. Background loading must preserve focus and the viewport. Dispatch shortcuts once, from the current menu, after app handlers and native edit exclusions. Include nested menus, mutually exclusive checked choices, disabled items, and menu replacement. Test Ctrl/⌘+S, Space, Home, arrows, and Tab with multiple apps running.

7. **High — Close, cleanup, and retry behavior are undefined.** [spec.md:36](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:36)

   **Observed:** Paint and Writer return `false` from `onClose` while awaiting a save decision (`src/apps/paint/main.ts:1266`, `src/apps/writer/main.ts:477`). Tracker stops audio on close or termination (`src/apps/tracker/main.ts:1208`, `:1238`). The kernel tracks bus subscriptions for cleanup (`src/kernel/kernel.ts:553`, `:639`). R13 tests only an immediate startup throw.

   **Derived:** A host can satisfy the current title test while discarding dirty work, retaining subscriptions, or starting duplicate players after retry.

   **Spec fix:** Require close vetoes, once-only termination, subscription removal, dialog settlement, and removal from `proc.list`. Specify whether a nearby closed placeholder stays closed until explicit activation. Cover import rejection, failure after partial initialization, concurrent activation, and successful retry. Catch failures in host-controlled callbacks separately so one bus subscriber cannot prevent delivery to others.

8. **High — The resource inventory omits required assets and uses the wrong manifest source.** [spec.md:23](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:23)

   **Observed:** Tracker reads `/home/guest/Music/demo.trk` (`src/apps/tracker/main.ts:504`). CastleSiege reads two `/usr/share/music/` songs through its music module (`src/apps/castlesiege/music.ts:6`). Shared buttons need `/usr/share/icons/*`; their loader otherwise returns `null` (`src/ui/icons.ts:7`, `:35`). App manifests come from `src/apps`, not `system/` (`scripts/build-image.ts:127`).

   **Derived:** The stated table produces silent demo playback and missing icons. This also conflicts with the binding demo-song decision (`docs/OWNER_QUESTIONS.md:38`).

   **Spec fix:** Define an explicit resource allowlist with source paths, binary support, and an icon-loader installation step. Allow 003/004 to supply their app resources lazily. Keep song selection and presentation in 003/004. Test actual icon resolution and parsing of registered songs.

9. **Medium — Scale, compact policy, and window units need a contract.** [spec.md:81](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:81)

   **Observed:** Paint and CastleSiege divide untransformed `clientWidth` by `scale()` (`src/apps/paint/main.ts:652`, `src/apps/castlesiege/main.ts:308`). Resize callbacks currently receive logical client dimensions (`src/wm/window.ts:149`). Apps read a live `env.DISPLAY_POLICY` and subscribe to `sys:policy` (`src/kernel/kernel.ts:569`, `src/apps/paint/main.ts:1281`).

   **Derived:** Including sheet zoom in `scale()` breaks layout calculations. Passing sheet pixels to `onResize` changes Tracker’s narrow-layout threshold (`src/apps/tracker/main.ts:1197`).

   **Spec fix:** Define app logical pixels, sheet pixels, and screen pixels. State that app scale excludes sheet zoom. Define callback timing and units, policy selection, and `sys:policy` ordering. State whether sheet layout overrides manifest dimensions and minima. Keep final app sizing in 003/004 and preserve the binding shared-layout decision (`docs/OWNER_QUESTIONS.md:24`).

10. **Medium — R14’s Paint click test misses actual transform failures.** [spec.md:48](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:48)

    **Observed:** Paint’s pixel calculation already divides by the transformed canvas rectangle (`src/apps/paint/main.ts:711`). Its two-finger pan instead writes screen-coordinate deltas directly to scroll offsets (`:955`). Popup positioning combines screen rectangles with untransformed element dimensions (`src/ui/menu.ts:198`). `overlayRoot()` falls back to `document.body` without `#display` (`src/ui/dom.ts:73`).

    **Derived:** At 50% zoom, a 100-screen-pixel touch movement scrolls 100 sheet pixels, producing only 50 screen pixels of movement. Changing `scale()` cannot fix this.

    **Spec fix:** Define overlay ownership and coordinate conversion. Test Paint drawing, selection dragging, two-finger canvas panning, Tracker sliders, and nested popup placement at fit, 50%, 100%, and 160%. Include panned windows and input during residual wobble. Assign necessary Paint changes to 004 rather than claiming unchanged app compatibility.

11. **Medium — R9 does not establish deliberate audio consent or cold-load playback.** [spec.md:43](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:43)

    **Observed:** CastleSiege plays victory music when `config.sound` is true, without checking `sys.sound.enabled()` or `config.music` (`src/apps/castlesiege/main.ts:743`). Its audio context is reached after a dynamic import and filesystem read (`src/apps/castlesiege/music.ts:24`, `src/apps/tracker/engine.ts:983`).

    **Derived:** Returning `false` from `enabled()` suppresses move effects but does not enforce R9 for victory music. **Unverified:** cold-load playback may require another gesture under browser audio policies.

    **Spec fix:** Define explicit opt-in and a visible retry when playback remains suspended. Test first playback with cold imports, keyboard activation, denied resume, and closing one app while another plays. Put CastleSiege victory-music behavior in 003. Keep the host’s sound policy and reusable audio checks in 002.

12. **Medium — R8’s palette test cannot prove dark theming.** [spec.md:64](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:64)

    **Observed:** Default and night contain the same palette values but different role mappings (`system/etc/themes/default.json:4`, `system/etc/themes/night.json:4`). Paint reads only `palette` (`src/apps/paint/main.ts:399`). Old theming also writes CSS role variables, publishes `sys:theme`, and refreshes icons (`src/kernel/theme.ts:74`, `src/kernel/kernel.ts:647`, `src/wm/wm.ts:125`).

    **Derived:** R8.a can pass while app chrome and text remain in the light scheme.

    **Spec fix:** Require scoped role variables, theme events, and icon refresh. Assert computed control, document, text, and selection colors. Test a live light/dark change without losing app content or changing sheet tokens.

13. **Medium — Reduced motion depends on a global the host never supplies.** [spec.md:81](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:81)

    **Observed:** `reducedMotion()` reads `document.documentElement.dataset.motion` (`src/ui/dom.ts:80`). The old window server sets it (`src/wm/wm.ts:249`). CastleSiege uses that helper and matching CSS selectors (`src/apps/castlesiege/main.ts:1323`, `src/apps/castlesiege/styles.css:110`).

    **Derived:** Respecting motion preferences only in sheet physics leaves app transitions and victory animations active.

    **Spec fix:** Add a host motion requirement for initial preference and live changes. Verify both preference directions. Include an app loaded while reduced motion is already active. Put CastleSiege animation scenarios in 003, with the shared motion contract in 002.

14. **Medium — `proc.spawn` needs arguments, identity, and unsupported-action rules.** [spec.md:41](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:41)

    **Observed:** Shared helpers spawn Writer with `--readonly` and a manual path (`src/apps/lib/open.ts:180`). `openPath` forwards file paths (`:95`). Writer can spawn a `.js` file (`src/apps/writer/main.ts:253`). CastleSiege’s Help actions target excluded Reader/Guide apps (`src/apps/castlesiege/main.ts:1073`).

    **Derived:** Panning alone does not define first startup, PID results, arguments, or behavior when the destination already contains dirty work. Some unsupported actions swallow errors.

    **Spec fix:** Define host registration, stable app IDs, PID results, first-start arguments, and repeated-spawn behavior. Preserve the owner’s “move the view to the tool” rule (`docs/OWNER_QUESTIONS.md:26`). Assign removal or replacement of Writer Run, Help/manual actions, and Paint Wallpaper to 003/004. Keep arbitrary JavaScript execution outside 002.

15. **Medium — Lazy-load distance and startup races are not testable as written.** [spec.md:44](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:44)

    **Observed:** “Within one screen” has no coordinate definition. R10.a gives no viewport or zoom (`spec.md:66`). The layout places Music at x=2380 (`docs/specs/001-sheet/spec.md:151`).

    **Derived:** A one-viewport margin can include Music from the initial desktop view. Fit view can legitimately trigger every app. “One request” also does not prove one `main()` invocation.

    **Spec fix:** Define the trigger using current window rectangles and viewport-sized screen margins. Cover pan, zoom, resize, moved windows, keyboard navigation, and explicit activation. Require a single shared startup promise. Test invocation counts as well as emitted JS/CSS requests, with fixed viewport and geometry fixtures.

16. **Medium — Several acceptance checks permit incomplete implementations to pass.** [spec.md:52](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:52)

    **Observed:** R2 tests only title changes. R3 tests one menu action. R7 tests only panning. R9 tests only silence. R1.a refers to R2–R9, which do not define several listed members.

    **Derived:** No-op resize callbacks, absent bus delivery, broken nested menus, and permanently silent playback can pass these checks.

    **Spec fix:** Add focused checks for size/position/focus callbacks, close cancellation, bus sender PID and unsubscribe, process-list changes, unsupported methods, and successful deliberate playback. Use host fixtures for 002. Put full game behavior in 003 and full editing/export behavior in 004. Each check should assert visible state, returned data, or exact callback counts.

17. **Low — “Nothing is stored” contradicts the permitted memory filesystem and downloads.** [spec.md:39](/Users/rargu/DevPageOS/docs/specs/002-app-host/spec.md:39)

    **Observed:** R6 retains writes during the visit (`spec.md:40`), while the boundary says “Never store visitor data” (`:91`). The binding owner decision prohibits saving arrangements (`docs/OWNER_QUESTIONS.md:24`).

    **Spec fix:** Say: “App files exist only in page memory. Reload clears visitor writes. Explicit downloads are allowed. No visitor state persists in browser storage.” Add a check that `/next` neither reads nor writes the old OS’s persistent visitor volume.

**Not checked:** There is no implemented host to exercise. I did not run browser, build, lint, or test commands. Build and test scripts generate files (`package.json:11`, `:13`, `:17`), which conflicts with this read-only review. Browser audio, download activation, actual Vite output, and visual isolation remain **Unverified**. Specs 003 and 004 are absent, so their eventual coverage could not be checked. No network actions or file changes were made.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (the RArgu OS site). Do not modify files.

Read first: AGENTS.md; docs/specs/002-app-host/spec.md (the spec under review); docs/specs/001-sheet/spec.md (the shell it builds on, critiqued); docs/OWNER_QUESTIONS.md (owner decisions, binding); src/sdk/os.d.ts; src/apps/castlesiege/main.ts, src/apps/paint/main.ts, src/apps/tracker/main.ts and engine.ts, src/apps/writer/main.ts; src/apps/lib/*.ts; src/ui/dom.ts, src/ui/menu.ts, src/ui/widgets.ts, src/ui/base.css; src/wm/ (to see what the window server gives apps today: menus, dialogs, scale, compact mode); src/kernel/ (how os objects are built and apps spawned); vite.config.ts; system/etc/.

Task: critique spec 002 before the owner approves it. Check: is the list of OS API calls in assumption 1 complete for these four apps and src/apps/lib (find any call or global the apps need that the spec misses, e.g. env.DISPLAY compact mode, os.app manifest fields, textContent, proc.list, window options like resizable/min sizes, menus with submenus/radio items, keyboard shortcuts registration, CSS that lives in wm.css)? Are the requirements testable, with acceptance checks that can fail? Risks: CSS leakage between apps and the sheet; scale()/--u assumptions; focus and keyboard shortcuts when several apps run on one page; audio context rules; downloads from saveFile without a user gesture; lazy loading and Vite chunk naming; zoom (CSS transform) breaking apps that use getBoundingClientRect or pointer math; reduced motion; error isolation. Flag anything that belongs to 003/004 instead.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
