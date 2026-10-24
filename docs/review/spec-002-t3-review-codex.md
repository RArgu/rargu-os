# Spec 002 T3: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16907-f40c-7d82-b7ff-b904b465afee · **Tokens:** 156,537
- **Date:** 2026-10-23 · **Scope:** uncommitted T3 working tree against `03b7710`
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Partial-start cleanup drops termination handlers (R12) | Accepted. Handlers kept per attempt and run once on failure cleanup. |
| 2 | Foreground start can leave the focused app inactive (R2) | Accepted. |
| 3 | The inert loading area cannot be activated (R11) | Accepted. |
| 4 | A failed host import disables every hosted window (R12) | Accepted. |
| 5 | Try again does not recover cached import or stylesheet failures (R12) | Partly accepted: failed stylesheet links removed and a cache-busting re-import on retry; browser cache behaviour beyond the tests stays Unverified. |
| 6 | The guard accepts imports from other modules in the registry chunk (001 R2.b) | Accepted. |
| 7 | The budget excludes apps that load on first visit (001 R22) | Accepted. All assets reachable from `/next` count. |
| 8 | Request checks miss Paint's `raster-*.css` (R11.a, 001 R2.a) | Accepted. |
| 9 | Hosted input bypasses the gesture owner (001 R21) | Accepted (minimal now; full routing in T5). |

## Codex output (verbatim)

Reviewed the working tree against `03b7710` with `git status --short`, `git diff HEAD`, `nl -ba`, and `rg`. Findings below separate observed code from derived behavior. No tests or builds were run.

1. **High — Partial-start cleanup discards termination handlers** — [load.ts:193](/Users/rargu/DevPageOS/src/sheet/host/load.ts:193), [load.ts:233](/Users/rargu/DevPageOS/src/sheet/host/load.ts:233)

   **Observed:** `onSignal: () => {}` discards registrations. `cleanup()` removes subscriptions and DOM, but never signals the app. CastleSiege registers `shutdown` to stop its bot, music, and ResizeObserver at [main.ts:1304](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:1304).

   **Derived:** If startup throws after these registrations, retry leaves the first attempt’s resources alive. This violates **002 R12**, which requires cleanup as in R10. Both failure fixtures create only DOM, so they cannot detect this leak.

   **Fix:** Retain termination handlers per attempt. Invoke them once during failure cleanup, isolate handler errors, and then remove subscriptions and DOM. Add a partial-start fixture whose termination handler releases an observable resource.

2. **Medium — Foreground startup can leave the focused app inactive** — [load.ts:123](/Users/rargu/DevPageOS/src/sheet/host/load.ts:123), [load.ts:284](/Users/rargu/DevPageOS/src/sheet/host/load.ts:284)

   **Observed:** Focus events use `setActive(run?.state === "running" ? run : null)`. The state becomes `"running"` only after `await mod.default(os)`. Writer, Tracker, and CastleSiege focus their content before `main()` returns.

   **Derived:** On a foreground start, the host ignores that focus event. It never checks focus again after startup. The editor can hold keyboard focus while `active` and the host overlay root remain null. This breaks **R2’s active-app behavior** and the established `overlayRoot()` contract.

   **Fix:** After successful startup, reconcile the active app with `document.activeElement`. Test a fixture that focuses a DOM control during `main()`, without calling `win.focus()`.

3. **Medium — The inert loading area cannot receive activation** — [load.ts:275](/Users/rargu/DevPageOS/src/sheet/host/load.ts:275), [main.ts:184](/Users/rargu/DevPageOS/src/sheet/main.ts:184)

   **Observed:** Background startup removes the placeholder’s role and Tab stop, then sets `run.area.inert = run.bg`. Activation listeners remain on that same area.

   **Derived:** While a cold import or asynchronous `main()` is pending, the inert area cannot receive a click or tap. Enter activation is also unavailable. Thus, the branch that clears background mode cannot be reached through those controls. This violates **R11’s activation paths**.

   **Fix:** Keep a usable loading control outside the inert subtree. Apply `inert` to the app root during background startup. Test click, tap, and Enter while startup is deliberately held pending.

4. **Medium — Failure to import the host disables every hosted window** — [main.ts:169](/Users/rargu/DevPageOS/src/sheet/main.ts:169)

   **Observed:**

   ```ts
   hostP ??= import("./host/load").then(...)
   void host().then((h) => h.start(id, background));
   ```

   There is no rejection handler or reset of `hostP`.

   **Derived:** If the host chunk or one of its dependencies fails to load, no window receives an error or Try again control. Every later activation reuses the rejected promise. This leaves a loading failure outside **R12’s recovery behavior**.

   **Fix:** Catch bootstrap failures, show a retry control in the affected window, and clear the failed bootstrap promise before retrying. Cover failure of the host chunk itself.

5. **Medium — Try again does not recover cached import failures** — [load.ts:253](/Users/rargu/DevPageOS/src/sheet/host/load.ts:253), [load.ts:279](/Users/rargu/DevPageOS/src/sheet/host/load.ts:279)

   **Observed:** Retry clears `run.start`, then calls the same loader with the same import URL. The flaky fixture throws inside `main()`, after its module has imported successfully.

   The existing emitted [preload helper:1](/Users/rargu/DevPageOS/dist/assets/preload-helper-Ct5FWWRu.js:1) also records a URL with `E[e]=!0` before loading completes. Subsequent calls skip recorded URLs.

   **Derived:** A cached module-evaluation rejection cannot recover through this retry. A failed stylesheet preload can also be skipped on retry, allowing an unstyled app to start. The current fixtures do not exercise either path required by **R12**.

   **Fix:** Add recovery for failed module and stylesheet loads, including fresh URLs for a cached failed module graph and removal of failed stylesheet links. Test transient JS/CSS failures and a once-failing module evaluation. Browser-specific fetch-failure caching remains **Unverified**.

6. **Medium — The guard accepts imports from other modules in the registry chunk** — [sheet-guard.ts:82](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:82)

   **Observed:** The registration predicate checks only:

   ```ts
   fromChunk.moduleIds.some(m => rel(m) === registry.module)
   toChunk.moduleIds.some(m => appMain.test(rel(m)))
   ```

   **Derived:** An unauthorized lazy import in a helper bundled beside `load.ts` passes this check. For example, a Writer import added to the bundled `host/window.ts` has the same chunk endpoints as the registered import. The standalone unregistered fixture does not cover this bypass. This weakens **001 R2.b**.

   **Fix:** Validate imports using the source module graph and resolved dynamic-import targets. Require the authorizing edge to originate in `load.ts`. Add a fixture with an unauthorized importer bundled into the registry chunk. Keep the emitted-chunk scan for forbidden system modules.

7. **Medium — The budget check excludes apps that load on first visit** — [sheet-guard.ts:161](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:161), [sheet-guard.ts:186](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:186)

   **Observed:** The guard calculates `gzip` and `appGzip` separately, then checks only `gzip > budgetKiB * 1024`. Its message explicitly puts registered apps “outside the budget.”

   **Derived:** Eligible apps start automatically. Their JS and CSS therefore contribute to first-load traffic, but can grow without failing this check. **001 R22** has no approved budget exemption for those bytes.

   **Observed artifact measurement:** Read-only `python3 -c` gzip calculations found approximately **61.9 KiB** for the existing sheet, host, CastleSiege, and Paint files. All four apps total approximately **81.7 KiB**. These artifacts are below the limit today.

   **Fix:** Enforce the budget across distinct reachable JS/CSS assets, including apps. That stricter check fits the existing artifact sizes and needs no exemption.

8. **Medium — Request checks miss Paint’s emitted CSS** — [host-helpers.ts:52](/Users/rargu/DevPageOS/tests/e2e/host-helpers.ts:52), [host-load.spec.ts:79](/Users/rargu/DevPageOS/tests/e2e/host-load.spec.ts:79)

   **Observed:** `appChunk()` recognizes only `app-<id>-<hash>.js|css`. However, the existing emitted [raster stylesheet:1](/Users/rargu/DevPageOS/dist/assets/raster-Ko1IR5Mt.css:1) contains Paint’s `.paint-*` rules. The emitted host preloads that file for Paint.

   **Derived:** The CSS request assertion never recognizes Paint’s stylesheet. An early request for it would escape both R11.a’s CSS check and updated **001 R2.a**. The naming plugin’s comment promises a naming scheme that the existing output does not follow.

   **Fix:** Derive app asset ownership from the emitted module graph or a generated manifest, including shared chunks and CSS. Assert every requested app-owned asset against the eligible app set.

9. **Medium — Hosted input bypasses the sheet’s gesture owner** — [main.ts:184](/Users/rargu/DevPageOS/src/sheet/main.ts:184), [view.ts:315](/Users/rargu/DevPageOS/src/sheet/view.ts:315)

   **Observed:** The new host listener starts the app but does not claim a gesture. The touch-pan exclusion contains controls but excludes neither `.demo-area[data-host]` nor canvas. Paint’s canvas handler calls `preventDefault()` and captures the pointer, but does not stop propagation at [main.ts:934](/Users/rargu/DevPageOS/src/apps/paint/main.ts:934).

   **Derived:** A touch on Paint’s canvas also reaches the sheet handler, which claims the pointer and captures it on `#vp`. A held app control also fails to prevent a second pointer from starting a sheet gesture. This breaks the existing **001 R21** invariant. Reset cannot cancel an app gesture through the shared owner either.

   **Fix:** Add the minimum host integration now: reserve app gestures, exclude running app areas from paper pan, stop view motion, and release or cancel ownership correctly. Full input routing can remain in T5.

**Other observed checks:** The inspected production host chunk contains no fixture IDs, `__hostMain`, or `URLSearchParams`; this supports removal of `?host=` in that artifact. The source still bans kernel, filesystem, window-server, and boot modules in app chunks. I found no default-start call into the deferred throwing dialog/process members. The diff changes no app source or dependencies.

**Not checked:** I did not run lint, tests, builds, browsers, network, deploy, or git-write commands. Browser import caching, actual focus and touch behavior, computed styles, Tab order, Reset, idle frames, and old-OS boot remain **Unverified**. Existing `dist/` inspection does not prove a fresh build of this working tree.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/002-app-host/spec.md (all, incl. "Lead notes") and tasks.md (row T3; T4-T8 for scope); docs/review/spec-002-critique-codex.md
- docs/specs/001-sheet/spec.md (R2.a + Amendment 2, R2.b, R7, R12, R13, R17, R19, R21, R22, "Advisor decisions")
- The change under review (T3): uncommitted working tree against HEAD 03b7710. Run `git status` and `git diff HEAD`, and read the new files: src/sheet/host/load.ts, src/sheet/host/window.ts, tests/e2e/host-load.spec.ts, tests/e2e/host-helpers.ts, tests/unit/host-window.test.ts, tests/fixtures/host/apps/*, tests/fixtures/sheet-guard/{registered,unregistered}.ts. Also read src/sheet/host/os.ts, fs.ts, src/sheet/main.ts, src/sheet/demos/visibility.ts, scripts/sheet-guard.ts, vite.config.ts, playwright.config.ts, src/sheet/sheet.css diff.

Task: review T3 (main window and lazy load: R2, R11, R12; updated 001 R2.a; guard R2.b). Check:
1. R11: start on eligibility (expanded view) or activation (click, tap, Enter on the placeholder, card navigation); one shared start promise, one import(), one main(); background start never takes focus or moves the view (the inert approach: side effects? does inert leak after start? focus() suppression until activation — correct?); R11.a/b tests prove it;
2. R2: setTitle/setSize (app px, within layout limits — what are the limits?)/onResize once/focus brings to front; setPosition ignored;
3. R12: start failure shows error + Try again; cleanup; starts once; other windows keep working; failed import() caching across browsers;
4. the guard change (001 R2.b): only lazy imports from load.ts of registered app main.ts; can it be bypassed? kernel/fs/wm/boot still banned in app chunks? the manualChunks "ui" change: effect on `/` (old OS) and on /next; the production "no-test-modules" check; fixture apps only in e2e mode; the `?host=` URL hook only in test builds (verify it is dead-code-eliminated in production);
5. interim behaviour of later-task members (thrown "not yet" errors): can a real app hit them on start and break? bus interim implementation;
6. the interim CSS (unscoped app CSS + sheet.css interim rules): does it change the sheet's computed styles/geometry (001 R18/R20, 002 R13 later) or break the old OS?
7. 001 regressions: gestures, focus reveal, Tab order (R19), Reset, R22 idle frames with apps running, the first-load budget (≤ 100 KiB gzip);
8. tests that cannot fail, sleeps, instrumentation that changes behaviour.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, app source unchanged in 002 (except src/ui/dom.ts), old OS working. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
