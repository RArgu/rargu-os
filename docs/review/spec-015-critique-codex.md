# Spec 015 critique (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec`, model `gpt-6.1-sol`, effort high,
  sandbox read-only, `--ephemeral`, `--ignore-user-config`
- Session id: 01a18056-3502-7113-b621-c4628357554c · tokens: 166,245 · date: 2026-10-27
- Input: `docs/specs/015-panel-trim/spec.md` on branch `spec-015-panel` (from `integration` at `2ebb4d8`), first draft

## Dispositions

All 14 checked against the files by the lead. Accepted: all except where noted.

| # | Finding | Disposition |
|---|---|---|
| 1 | Removing Copy breaks `main.ts:113` | Accepted (observed: unguarded `$("#copy")`). New R3.f. |
| 2 | Anchor without href has no keyboard focus | Accepted. R3.b sets the href at start-up. |
| 3 | Resume and notice leak or lose contact with JS off | Accepted. R3.e, Q4. |
| 4 | Leak check too narrow; grep error reads as clean | Accepted. R3.a: scanner script over all of `dist/`, production and fixture builds. |
| 5 | Notes override needs host-root selectors and roles | Accepted. R7.b. |
| 6 | Contrast table lacks states | Accepted. R7.d (brown on dark chrome `#5f574f` is 1.94:1). |
| 7 | Half-width spacing not calculated | Accepted. Approach has the row budget; Q1 gives the options. |
| 8 | Pentimento copy implies a built product | Accepted. Copy changed to "planned" and "designed". |
| 9 | `/p/` pages are not unchanged | Accepted. R6.c narrowed. |
| 10 | Two-line check passes at wrong zoom; demo area cannot absorb the gap | Accepted. R6.b uses unscaled height; plan lowers four heights by 23 px (Q5). |
| 11 | Test list misses assertions | Accepted. Added to the Done-when list. |
| 12 | R1.a source scan conflicts with commented-out text | Accepted. Heading and hint are deleted; only the identity markup is kept as a comment. |
| 13 | Owner questions undefined | Accepted. Q1 to Q5 written. |
| 14 | Two evidence claims wrong | Accepted. Castle Wars "sprite sheets" claim fixed; production versus fixture observations separated (R3.a). |

## Codex output (verbatim)

The spec needs revision before approval. No files were changed. No network calls were made.

Evidence came from `nl -ba`, `rg -n`, read-only Python scans, and a small local DOM check. Findings distinguish **observed** facts from **derived** or **inferred** effects.

**High**

1. **Removing Copy also requires a startup change.**  
   [Spec:153](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:153)

   **Observed:** The approach omits `src/sheet/main.ts`. It unconditionally calls `$("#copy").addEventListener` at `src/sheet/main.ts:113`.

   **Derived:** Removing the button without changing this caller stops module execution. Later navigation, Reset, and app startup handlers will not register.

   **Fix:** Explicitly remove the Copy handler and its unused message code. Require startup without page errors and working navigation and Reset.

2. **The proposed Email link is inaccessible by keyboard.**  
   [Spec:159](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:159)

   **Observed:** The proposed anchor has no `href`. A local `node --input-type=module` check with jsdom confirmed that it cannot receive normal focus.

   **Derived:** Its `focus` handler cannot initialize the link through Tab navigation. Assistive activation can also dispatch `click` without `pointerdown`.

   **Fix:** Build and assign `href` during initialization, then reveal the anchor. Test Tab, Enter, pointer activation, and the accessible link name. This still keeps the complete address out of build output.

3. **The resume and correction-notice requirements remain unresolved.**  
   [Spec:73](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:73)

   **Observed:** `content/resume.md:3` contains the public email. `scripts/build-resume-html.ts:28` renders that body directly. The generated page has no module script. Merely adding `email.ts` does not change this path.

   The static correction notice also embeds the address directly at `scripts/sheet-content.ts:316`. Spec 013 requires that contact route at `docs/specs/013-project-readme-window/spec.md:127`.

   **Derived:** The approach either leaves a build leak or removes email contact for visitors without JavaScript. A native, working `mailto:` link needs its destination available without JavaScript.

   **Fix:** Define the resume transformation and initialization entry. Resolve the no-JavaScript contact fallback for the resume and correction notice. State the intentional change to the earlier contract.

**Medium**

4. **The automated leak check does not cover the complete output.**  
   [Spec:67](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:67)

   **Observed:** The shell scan covers `dist/`, but the proposed unit check names only `index.html` and `resume.html`. `/p/` pages copy the complete built sheet at `scripts/p-pages.ts:101`. Case JSON is emitted separately at `scripts/p-pages.ts:125`.

   Production currently has no enabled project write-ups. The e2e overlay enables them at `vite.config.ts:19`.

   **Derived:** A production-only check can pass without exercising the case-study path. The shell command also treats a `grep` error as `clean`.

   **Fix:** Automatically scan every emitted asset in production and fixture builds, including HTML, JS, JSON, and any maps. Fail on read errors or invalid email parts. Report filenames without printing the public email.

5. **The Notes override needs selectors and roles that match the host.**  
   [Spec:164](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:164)

   **Observed:** `src/sheet/host/styles.ts:35` declares theme properties directly on every `.host-root`. The menu has a separate root at `src/sheet/host/window.ts:195`. Token aliases are also declared on that root through `src/ui/tokens.css:61`.

   **Derived:** Properties on `[data-win="notes"]` alone cannot replace properties declared on its child host roots. `--win-bg` does not control the textarea, which uses `--document` and `--document-text` at `src/ui/base.css:249`.

   **Fix:** Specify overrides directly on the Notes host roots. Map document, text, chrome, menu, selection, hover, and active roles. Specify the status-bar exception separately because it shares `--chrome` with menus.

6. **The Notes contrast table does not cover interactive states.**  
   [Spec:130](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:130)

   **Observed:** Python recomputation confirms every listed ratio. However, open menus use `--title-active` and `--text-inverse` at `src/ui/base.css:792`. The dark bar-button chrome is currently `#5f574f`.

   **Derived:** The proposed brown text on that retained dark chrome gives only **1.94:1**. The palette table alone cannot prove the rendered controls pass.

   **Fix:** Check actual computed colors after Notes starts and after a scheme change. Include open menus, selected text, Find controls, title buttons, and visible focus rings. Preserve the host’s existing focus-band checks.

7. **The half-width panel needs a concrete spacing calculation.**  
   [Spec:155](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:155)

   **Observed:** The stated text widths total 97 px. Current button padding, borders, and row gaps produce a **191 px** row, before panel padding (`src/sheet/sheet.css:470`, `:483`).

   **Derived:** Even with zero button padding, the row needs 125 px. A 140 px panel then permits only 5.5 px padding per side. Three 36 px tool cells plus current gaps need 120 px.

   **Inferred:** A 150 px panel appears feasible with explicit compact spacing. The spec does not demonstrate the full height or readable project rows.

   **Fix:** Specify panel padding, button padding, gaps, and control heights. Verify project names and status labels remain on one line. Include keyboard focus, enlarged text, and target spacing.

8. **Pentimento’s proposed copy still implies an existing product.**  
   [Spec:106](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:106)

   **Observed:** Its write-up says “Status: planning. Nothing is built yet” at `content/projects/pentimento.md:13`. The proposal says “built so AI agents can drive it.”

   **Fix:** Describe it as planned or designed. The other four proposals agree with their write-ups. All five proposed word and character counts are correct.

9. **The claim that `/p/` pages are unchanged is false.**  
   [Spec:88](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:88)

   **Observed:** `scripts/p-pages.ts:101` copies the built sheet HTML, including its summaries. With JavaScript, these pages start the same sheet.

   **Derived:** Their summary markup changes, even though metadata uses `writeup.lede` and the Read body does not use `summary`.

   **Fix:** Narrow the promise to unchanged metadata and write-up body. Verify `/p/` pages with JavaScript enabled and disabled.

10. **The two-line acceptance check can pass at the wrong zoom.**  
    [Spec:86](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:86)

    **Observed:** The sheet uses a CSS transform for zoom (`src/sheet/view.ts:53`). The acceptance check specifies neither zoom nor measurement method.

    **Derived:** Three lines at 50% zoom occupy about 35 screen pixels and pass a 47 px bounding-box check.

    **Fix:** Wait for fonts and measure unscaled height or actual text-line rectangles. Test without the clamp, with and without JavaScript. Also choose the window-height adjustment: `.demo-area` currently has `flex: none` at `src/sheet/sheet.css:346`, so it cannot automatically absorb the gap.

11. **The test migration list misses assertions that enforce old behavior.**  
    [Spec:186](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:186)

    **Observed:** Beyond the listed locations:

    - `tests/e2e/host-styles.spec.ts:461` expects the old Notes theme values.
    - `tests/e2e/host-styles.spec.ts:288` rejects sheet selectors that reach into app descendants.
    - `tests/unit/sheet-content.test.ts:236` expects the removed tagline.
    - `tests/e2e/sheet.spec.ts:93` requires name, title, tagline, and email without JavaScript.
    - `tests/e2e/readme-case-studies.spec.ts:45` expects an initialized mail link before interaction.

    **Fix:** List the changed contracts explicitly. Preserve theme isolation, focus, escaping, and correction-link coverage when replacing these assertions.

12. **The removal check conflicts with the preservation approach.**  
    [Spec:57](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:57)

    **Observed:** R1.a forbids the removed strings across source and tests. The approach at line 153 preserves the heading and hint as comments.

    **Derived:** Those comments fail the source scan. Negative tests containing the forbidden strings also fail it.

    **Fix:** Preserve only the identity markup requested by R5, using source comments outside the returned HTML. Check rendered text and accessible names separately from source preservation.

13. **The owner questions are incomplete.**  
    [Spec:224](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:224)

    **Observed:** Q2–Q5 are referenced without defined questions. Q1 points to a critique section that does not exist. `index.html:13` currently contains the keyboard instruction that R1.b removes.

    **Fix:** Define every pending decision before approval. Include panel width, keyboard instructions, title-block scope, resume fallback, and Insider wording. Specify any replacement `aria-describedby` text and retain the named project navigation.

**Low**

14. **Two evidence claims need correction.**  
    [Spec:113](/Users/rargu/DevPageOS-015/docs/specs/015-panel-trim/spec.md:113)

    **Observed:** The Castle Wars write-up does not contain “These are the real sprite sheets.” That sentence exists only in its current summary (`content/projects/castlewars.md:8`).

    The existing `dist/index.html` contains one public-email occurrence, and `dist/` contains no `/p/` pages. This does not support the production case-notice claim at spec line 212.

    **Fix:** Correct the write-up claim. Label production and fixture-build observations separately.

**Not checked:** A fresh build, lint, unit tests, e2e, screenshots, real browser accessibility, or mail-client launch. These require execution beyond this read-only review. Existing-output scans found no literal public email under `worker/`, `jobs/`, or `public/`, and no source maps in `dist/`. Split strings remain reconstructable by JavaScript-aware scrapers.