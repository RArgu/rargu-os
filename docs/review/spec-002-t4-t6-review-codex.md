# Spec 002 T4 and T6: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16941-aacf-7f43-9547-f96e8961a9ef · **Tokens:** 202,576
- **Date:** 2026-10-23 · **Scope:** uncommitted T4 (child panels, dialogs) + T6 (scoped styles, theme, scale, motion)
  working tree against `75328b7`; one review, the tasks were built in parallel
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | A failed host stylesheet is never retried (R12, R3/R4) | Accepted (T6 agent). |
| 2 | Child panels get no initial focus (R3, 001 R19) | Accepted (T4 agent). |
| 3 | Child roots bypass background-start focus protection (R11) | Accepted (T4 agent). |
| 4 | Forced focus ring clipped and below 3:1 on the CastleSiege board in dark (001 R18) | Accepted (T6 agent). |
| 5 | Child resize reports sizes CSS does not apply (R3) | Accepted (T4 agent). |
| 6 | The two load-order tests do not enforce two orders (R13.a) | Accepted (T6 agent). |
| 7 | Paint's child dialog content clipped | Accepted (T4 agent). |
| 8 | CSS transform not string-aware; `:is(:root, …)` | Accepted (T6 agent). |
| 9 | CSS audit misses adopted stylesheets | Accepted (T6 agent). |

## Codex output (verbatim)

Reviewed against `75328b7` with `git status --short`, `git diff HEAD`, `nl -ba`, and `rg`. **Observed** means source or existing artifact inspection. **Derived** means the consequence follows from that code.

1. **High — Retrying a failed host stylesheet starts the host without its required CSS**  
   [load.ts:61](/Users/rargu/DevPageOS/src/sheet/host/load.ts:61), [main.ts:178](/Users/rargu/DevPageOS/src/sheet/main.ts:178)

   **Observed:** Stylesheet failure tracking starts inside the host module:
   ```ts
   document.addEventListener("error", ...)
   ```
   Bootstrap retry instead imports:
   ```ts
   /* @vite-ignore */ `${hostUrl}?retry=${hostTries}`
   ```
   The existing production preload helper rejects a failed CSS preload **before** calling the module import. Its retry import has an empty dependency list.

   **Derived:** If `load-*.css` fails, the error tracker never runs. Retry loads the JS without retrying that CSS. Widget styles and tokens remain absent. Panel scrims also lose their absolute positioning and can appear below the full-height app root, outside the clipped demo area. This breaks **R12 recovery** and **R3/R4 panels**.

   **Fix:** Install stylesheet failure tracking in the sheet bootstrap, before the first host import. Retry and await failed host stylesheets before creating the host. Add a failure case for `load-*.css`, asserting panel visibility and computed styles after retry.

2. **Medium — Child panels do not receive initial focus**  
   [window.ts:385](/Users/rargu/DevPageOS/src/sheet/host/window.ts:385)

   **Observed:** `open()` returns `takeFocus`, but `child()` discards it:
   ```ts
   const { panel, titleEl } = open(opts.title, root, () => end(true));
   ```
   The child root has no `tabindex`, and no initial focus call follows. CastleSiege’s `askNewGame()` appends its controls without focusing one ([main.ts:925](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:925)). The fixture hides this omission with `cancel.focus()`.

   **Derived:** Opening “New Game” blocks the owner without moving keyboard focus into the panel. Escape and the Tab trap only run on events inside the scrim. This breaks **R3 modal focus behavior** and **001 R19**.

   **Fix:** Give foreground child panels a focusable fallback and focus it immediately. After synchronous content insertion, preserve any focus the app supplied. Add a fixture that makes no focus call, plus a real CastleSiege keyboard check.

3. **Medium — Child roots bypass background-start focus protection**  
   [window.ts:363](/Users/rargu/DevPageOS/src/sheet/host/window.ts:363), [load.ts:285](/Users/rargu/DevPageOS/src/sheet/host/load.ts:285)

   **Observed:** Background blocking applies to the main root:
   ```ts
   block("bg", deps.background());
   ```
   Child roots are separate siblings and receive no equivalent block. Paint explicitly calls:
   ```ts
   body.querySelector<HTMLInputElement>("input:checked")?.focus();
   ```

   **Derived:** A child created during background startup can focus its controls directly. The guard on the child’s `focus()` method does not intercept native DOM focus. This violates **R11’s background-focus guarantee**.

   **Fix:** Pass startup background state into the panel manager. Block child content during background startup and release that block on activation or startup completion. Test a background fixture that creates a child and directly focuses an input.

4. **Medium — The forced focus rule does not guarantee visible, contrasting focus**  
   [sheet.css:665](/Users/rargu/DevPageOS/src/sheet/sheet.css:665)

   **Observed:**
   ```css
   outline: var(--ring, 2px) solid var(--focus) !important;
   outline-offset: 0 !important;
   ```
   Imported radio styles use `clip-path` ([base.css:591](/Users/rargu/DevPageOS/src/ui/base.css:591)). Host roots now use `overflow: clip`. CastleSiege’s board backgrounds are `#ffccaa` and `#ab5236`.

   **Derived:** The outline outside a clipped radio is clipped too. Full-width controls can also lose outline edges at the host boundary. In dark mode, the blue focus color has only **1.70:1** and **2.13:1** contrast against CastleSiege’s board colors, below **001 R18’s 3:1** requirement. Ratios came from a read-only Python WCAG calculation.

   **Fix:** Draw radio focus on its unclipped label. Use an inset indicator at clipped boundaries and a contrasting backing band for board controls. Verify rendered focus in both schemes and at reduced zoom.

5. **Medium — Child resize callbacks report dimensions that CSS does not apply**  
   [window.ts:403](/Users/rargu/DevPageOS/src/sheet/host/window.ts:403)

   **Observed:**
   ```ts
   root.style.width = px(w);
   root.style.height = px(h);
   for (const cb of [...resizeCbs]) cb(Math.round(w), Math.round(h));
   ```
   Minimum dimensions remain separate CSS properties. The old window implementation clamps dimensions before applying them.

   **Derived:** A child with minimum size `160 × 100`, resized to `100 × 50`, remains at least `160 × 100` but reports `100 × 50`. This breaks **R3’s minimum-size contract** and can mislead app layout code.

   **Fix:** Clamp stored dimensions against the minimums and report the applied client size. Test a resize below both minimums.

6. **Medium — The two load-order tests do not enforce two load orders**  
   [host-styles.spec.ts:122](/Users/rargu/DevPageOS/tests/e2e/host-styles.spec.ts:122)

   **Observed:** Both tests queue every activation while the host is held:
   ```ts
   for (const id of wins) await page.evaluate(...);
   await release();
   for (const id of wins) await running(page, id);
   ```

   **Derived:** All starts become eligible together when the host resolves. Waiting afterward in array order does not control CSS arrival order. Both tests can exercise the same order, missing the order-dependent regression required by **R13.a**.

   **Fix:** Hold individual app requests and release them sequentially in each requested order. Assert the actual stylesheet load sequence before comparing styles and geometry.

7. **Low — Child content can be clipped before the panel’s scrollbar sees it**  
   [panels.css:58](/Users/rargu/DevPageOS/src/sheet/host/panels.css:58), [sheet.css:645](/Users/rargu/DevPageOS/src/sheet/sheet.css:645)

   **Observed:** The generic dialog rule also matches Paint’s child dialog:
   ```css
   .host-panel-body > .host-root > .dialog {
     gap: 8px;
     padding: 10px;
   }
   ```
   Paint fixes its child root at `132px` high. That root has `overflow: clip`; only its parent has `overflow: auto`.

   **Derived:** Paint’s dialog content needs approximately `144px` with these rules, clipping its bottom. Longer child content is likewise hidden inside the root before the outer scrollbar can expose it. This weakens **R3’s usable child-panel behavior**.

   **Fix:** Separate message-dialog sizing from app child content. Put scrolling on the constrained child content root, or constrain the dialog layout to its declared height. Check complete control bounds, including at phone zoom.

8. **Low — Selector filtering treats quoted text as selector syntax**  
   [host-css.ts:51](/Users/rargu/DevPageOS/scripts/host-css.ts:51), [host-css.ts:63](/Users/rargu/DevPageOS/scripts/host-css.ts:63)

   **Observed:**
   ```ts
   if (/\.win(?![\w])|\.wm-/.test(sel)) return null;
   const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
   ```

   **Derived:** `[data-name=".win"]::before` is incorrectly dropped. `[data-name="a/*x*/b"]` is changed to a different selector. The scanner handles ordinary quoted commas and braces, but these earlier operations bypass that protection. Compound forms such as `:is(:root, .x)` also never receive the root replacement. These are parser edge failures against **R13**, though I found no current app selector that triggers them.

   **Fix:** Make comment removal and selector classification string-aware. Handle root compounds explicitly, or reject unsupported forms during the build. Add the concrete examples above.

9. **Low — The CSS audit excludes the stylesheet used by live theming**  
   [host-styles.spec.ts:178](/Users/rargu/DevPageOS/tests/e2e/host-styles.spec.ts:178)

   **Observed:** The audit reads only:
   ```ts
   [...document.styleSheets]
   ```
   Theme rules instead enter through `document.adoptedStyleSheets` ([styles.ts:52](/Users/rargu/DevPageOS/src/sheet/host/styles.ts:52)).

   **Derived:** An accidental global rule in the adopted theme sheet escapes this audit. The current intentional `:root{--text:...}` rule also escapes it. The check therefore does not cover all styles installed by **T6**.

   **Fix:** Audit both stylesheet collections. Allow only the explicit icon-tint variable on `:root`; reject other global theme declarations.

**Other observed checks:** The existing production host chunk contains neither `__hostMenu` nor fixture IDs. Read-only gzip calculations reproduce **90.5 KiB**, leaving **9.5 KiB**. Compared with the recorded T3 figure, growth is **7.7 KiB**; the new host stylesheet accounts for **4.3 KiB**. Four app entry modules have separate hosted and old-OS copies, but `/next` references the hosted copies. The diff changes no app source, old-OS CSS source, or dependencies. Existing animation names are global, but I found no collision with sheet keyframes.

**Could not check:** No tests, builds, browsers, network, deploy, or git-write commands ran. Actual focus, phone scrolling, gestures, idle frames, icon pixels, old-OS boot, and dev/build parity remain **Unverified**. Existing `dist/` inspection does not prove a fresh build of this working tree.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/002-app-host/spec.md (all, incl. "Lead notes") and tasks.md (rows T4 and T6; T5 menus, T7 close, T8 files for scope); docs/review/spec-002-critique-codex.md, docs/review/spec-002-t3-review-codex.md
- docs/specs/001-sheet/spec.md (R18 contrast, R19 focus, R20 look, R21 gestures, R22 budget, "Advisor decisions")
- The change under review: uncommitted working tree against HEAD 75328b7 (T4 child panels/dialogs and T6 scoped styles/theme/scale/motion, built in parallel). Run `git status` and `git diff HEAD`; read the new files: src/sheet/host/panels.css, src/sheet/host/styles.ts, scripts/host-css.ts, tests/unit/host-dialogs.test.ts, tests/unit/host-css.test.ts, tests/e2e/host-window.spec.ts, tests/e2e/host-styles.spec.ts, tests/fixtures/host/apps/fx-dialogs, fx-theme. Also src/sheet/host/window.ts, load.ts, os.ts, scripts/host-chunks.ts, vite.config.ts, src/sheet/sheet.css.
- Old-OS semantics to match (read only): src/wm/wm.ts and src/wm/window.ts (child windows, dialogs), src/ui/widgets.ts, src/ui/base.css, src/ui/tokens.css, src/wm/wm.css, src/ui/icons.ts; the apps' dialog and CSS use.

Task: review T4 (R3: child window = modal panel inside the owner's window, size/minSize, blocks owner input, focus returns, never closes the app; R4: alert/confirm/choose/prompt as panels; Esc values; background dialogs never steal focus or move the view; closeAll seam for T7) and T6 (R13: app/widget/dialog CSS only under a host root, html/body/.dpos/chrome rules dropped, sheet .win renamed, loading apps in any order does not change the sheet's computed styles or geometry; R14: role variables per host root, sys.theme.get, sys:theme on change, icons refresh, set is a no-op; R15: --text-size 16px and --u 1px at every zoom; R16: dataset.motion before any app starts and on change). Check:
1. correctness and edge cases of each; focus trap and return; Esc handling vs the app's own Esc; nested panels; panels at zoom and on phone; the test-only __hostMenu hook is absent from production;
2. the CSS transform in scripts/host-css.ts: selector parsing robustness (commas inside :is()/:not(), attribute selectors with commas/braces in strings, @media/@supports/@layer/@container, :root and html/body inside compound selectors, ::before, keyframes names colliding with the sheet's), the `?host` CSS split (does `/` stay unscoped? any module duplicated?), dev vs build parity;
3. theme mapping: role variables, live change, icons refresh, contrast (001 R18) of the app roles on the sheet chrome; the forced focus ring kept from T3;
4. 001 regressions: sheet computed styles/geometry (R13.a), focus ring, gestures, R22 idle frames, the budget (90.5 KiB of 100 — what grew and is any of it avoidable?), old OS `/` unchanged (CSS identical; JS chunk layout changed — risk?);
5. tests that cannot fail, sleeps, test-only hooks leaking.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, app source unchanged in 002 (except src/ui/dom.ts), old OS working. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
