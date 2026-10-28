# Spec 015 implementation review (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec`, model `gpt-6.1-sol`, effort high,
  sandbox read-only, `--ephemeral`, `--ignore-user-config`
- Session id: 01a1841c-1c2b-70f1-b893-2199a4e3e71a · tokens: 158,427 · date: 2026-10-28
- Input: `git diff 4d01adb..b7e2a40` on branch `release-015` (on `main` 34010cf), spec 015, its critique, mocks README

## Dispositions

Each finding checked against the files by the lead (2026-10-28). The owner asked to fix all 9 (2026-10-28); the
fixes are listed after the table.

| # | Finding | Disposition |
|---|---|---|
| 1 | e2e resume uses the real email parts | Accepted, severity Medium. `npm run image` runs before Vite and reads the local file (`scripts/build-resume-html.ts:35-37`); the fixture is set only for `sheetContent` (`vite.config.ts:71`). R9.a says fixture builds never read the local file. `dist-e2e/` is local and not deployed or tracked, so nothing public leaks |
| 2 | resume accepts empty or non-string parts | Accepted. Only `parts?.length === 2` is checked (`build-resume-html.ts:43`); `addressFrom` in `check-no-email.ts:12` already validates. Reuse it |
| 3 | parse errors can print the address | Accepted (inferred from V8's JSON error text, which quotes the input; Codex observed it in memory). Only on a malformed local file |
| 4 | no automated scan of full builds | Accepted as a test gap. The scan was run by hand on this build: `clean` |
| 5 | no e2e for R2.a–c, R4.a–b | Accepted. No test asserts the 150 px width, the 396 px height, the viewport list or the button row (`grep` of `tests/`) |
| 6 | no R6.b test with the clamp removed | Accepted. Only word counts are tested (`tests/unit/summary-words.test.ts`) |
| 7 | Notes contrast tested from CSS text, not computed states | Accepted. R7.d asks for computed colors after start and after a scheme change |
| 8 | Notes status bar uses `#e8cf55`, not the body `#fff3a8` with dim text | Accepted, defect. Spec table and R7.b ("the status bar ... is set apart"); visible in the Notes screenshot |
| 9 | README and specs index out of date | Accepted. `README.md:5` still names the card's name; `docs/specs/README.md` row says awaiting approval |

## Fixes (2026-10-28, owner: fix all 9)

| # | Fix |
|---|---|
| 1 | `playwright.config.ts`: the test server's build sets `DPOS_EMAIL` to the fixture, so the resume step uses it too. New e2e `015 R9.a` checks every `data-u`/`data-d` pair on the sheet and `/resume.html` is the fixture. The build guard (#4) fails a test build that holds the real local part (observed: a test build without `DPOS_EMAIL` now fails with `email LEAK in 1 built file`) |
| 2 | New `scripts/email-parts.ts` `readEmail`: the one checked reader for the sheet, the resume and the leak check. Unit tests for wrong types, empty parts, wrong counts and the missing file (`tests/unit/email-parts.test.ts`) |
| 3 | `readEmail` replaces a JSON parse error with a fixed message (file name only). Unit and CLI tests check the text is not in the output |
| 4 | `noEmailLeak` Vite plugin (`scripts/check-no-email.ts`, in `vite.config.ts`): every production and test build scans its whole output and fails on the address. Unit tests for the plugin and the command (clean, LEAK, ERROR, `--tracked`) |
| 5 | New `tests/e2e/panel-trim.spec.ts` (R2.a–c, R4.a–b: six desktop sizes, light and dark, width, height, scroll, rectangles, clipping, one-line items, the link row) and `tests/e2e/compact-panel-trim.spec.ts` (390 × 844 and 320 × 568, folded and open) |
| 6 | `panel-trim.spec.ts` R6.b: clamp removed, fonts loaded, `offsetHeight` ≤ 47 for the five windows, with and without JavaScript |
| 7 | `panel-trim.spec.ts` R7.a/R7.d: computed colours of body, title bar, bar button, menu row, status bar, open menu, Find controls, selection and focus ring, after start and after a scheme change, light and dark. Unit test adds the dark ring override and the status bar rule |
| 8 | Notes status bar `#fff3a8` with `#5c4423` text: the Writer's `styles.css` reads `--t-status-bg` / `--t-status-text`, set in the Notes role block of `src/sheet/sheet.css` (a direct `.statusbar` rule in `sheet.css` broke host-styles R13). Observed: the R7 e2e fails on the old CSS and passes on the new |
| 9 | `README.md`: the panel, the local email file, the fixture and the leak check. `docs/specs/README.md`: 015 row status |

## Codex output (verbatim)

1. **High — The e2e resume uses the real email parts (R9.a).**  
   [scripts/build-resume-html.ts:36](/Users/rargu/DevPageOS-r015/scripts/build-resume-html.ts:36), [vite.config.ts:71](/Users/rargu/DevPageOS-r015/vite.config.ts:71)

   **Observed:** The fixture setting applies only to `sheetContent`. The resume generator runs first and defaults to the local file. A read-only Python check confirmed that existing `dist-e2e/resume.html` contains the historical public email parts. Its sheet page uses the fixture parts.

   **Derived:** Fixture builds depend on private machine state and expose the real address after resume initialization.

   **Fix:** Select the fixture for the entire e2e build, including resume generation. Assert fixture parts in every emitted email link.

2. **Medium — The resume accepts invalid email parts (R9.a).**  
   [scripts/build-resume-html.ts:38](/Users/rargu/DevPageOS-r015/scripts/build-resume-html.ts:38)

   **Observed:** The generator checks only `parts?.length === 2`. An in-memory Node check supplied an empty local part and intercepted all output writes. Generation succeeded with a dead link. `initMail` then skips that link.

   **Fix:** Use the same validated tuple parser for the sheet, resume, and scanner. Test invalid types, empty parts, and the missing-file case.

3. **Medium — Scanner errors can print an email address.**  
   [scripts/check-no-email.ts:13](/Users/rargu/DevPageOS-r015/scripts/check-no-email.ts:13), [scripts/check-no-email.ts:79](/Users/rargu/DevPageOS-r015/scripts/check-no-email.ts:79)

   **Observed:** `JSON.parse` errors pass directly into console output. An in-memory Node check confirmed that malformed JSON containing a synthetic address produces an error message containing that address. The build readers also leave parse errors unsanitized.

   **Derived:** A malformed local file can expose address text in build logs, contrary to the privacy contract.

   **Fix:** Catch parse errors and report only the filename and a fixed diagnostic. Test that diagnostics exclude synthetic address text.

4. **Medium — Automated privacy checks never scan complete builds (R3.a).**  
   [tests/unit/check-no-email.test.ts:14](/Users/rargu/DevPageOS-r015/tests/unit/check-no-email.test.ts:14), [package.json:13](/Users/rargu/DevPageOS-r015/package.json:13)

   **Observed, from `rg -n` and source inspection:** Scanner tests cover synthetic files only. Neither build command invokes the scanner. The required production and fixture scans—including `/p/` pages, case JSON, resume, and bundled assets—have no automated coverage.

   **Fix:** Add integration checks over every emitted asset in both build modes. Exercise the CLI’s success, leak, read-error, and tracked-file paths.

5. **Medium — Panel geometry and button rows lack the required tests (R2.a–c, R4.a–b).**  
   [tests/e2e/sheet-card.spec.ts:144](/Users/rargu/DevPageOS-r015/tests/e2e/sheet-card.spec.ts:144), [tests/e2e/compact-sheet.spec.ts:416](/Users/rargu/DevPageOS-r015/tests/e2e/compact-sheet.spec.ts:416)

   **Observed:** The new desktop test checks Email initialization and focus. The phone test retains the broad folded-height bound of `<90`. No test checks the six desktop viewports, 150 px width, 396 px height, overflow, contained text, or equal button tops.

   **Derived:** Passing existing tests does not establish the new layout requirements. The CSS height budget is approximately 306 px with Email present, so source inspection alone establishes no height defect.

   **Fix:** Add the specified light/dark viewport matrix, including both phone widths. Check actual text and control rectangles, wrapping, scroll dimensions, and button rows.

6. **Medium — Two-line descriptions are not tested without the clamp (R6.b).**  
   [tests/unit/summary-words.test.ts:8](/Users/rargu/DevPageOS-r015/tests/unit/summary-words.test.ts:8), [src/sheet/sheet.css:309](/Users/rargu/DevPageOS-r015/src/sheet/sheet.css:309)

   **Observed:** The new test checks word counts only. No test removes the clamp, waits for fonts, and measures unscaled description height across all five windows with JavaScript enabled and disabled.

   **Derived:** A description can exceed two lines while the clamp hides the failure.

   **Fix:** Add the explicit `offsetHeight <= 47` checks at zoom 1 with the clamp removed. Keep window-height and footer-gap checks separate.

7. **Medium — Notes contrast tests do not verify rendered states (R7.a, R7.d).**  
   [tests/unit/notes-contrast.test.ts:12](/Users/rargu/DevPageOS-r015/tests/unit/notes-contrast.test.ts:12), [tests/e2e/host-styles.spec.ts:423](/Users/rargu/DevPageOS-r015/tests/e2e/host-styles.spec.ts:423)

   **Observed:** The unit test reads the first matching CSS rule. It misses the dark focus override and never checks computed styles. The theme-change test moves from Notes to Paint. Existing Notes textarea focus-band tests remain, but no replacement covers Notes menus, selection, Find controls, and scheme changes.

   **Fix:** Check computed text/background pairs and focus borders after Notes starts and after a scheme change. Preserve the existing focus-band checks.

8. **Low — Notes status colors differ from the approved palette (R7.b).**  
   [src/sheet/sheet.css:713](/Users/rargu/DevPageOS-r015/src/sheet/sheet.css:713), [src/ui/base.css:1055](/Users/rargu/DevPageOS-r015/src/ui/base.css:1055)

   **Observed:** The status bar uses `--chrome`. Notes sets that role to `#e8cf55` without a status-specific override.

   **Derived:** The status background uses menu yellow instead of the approved body yellow, `#fff3a8`. Its text also retains the normal text role.

   **Fix:** Give the Notes status bar its specified body background and dim text color. Assert their computed values.

9. **Low — Documentation does not match the implementation (R8).**  
   [README.md:5](/Users/rargu/DevPageOS-r015/README.md:5), [docs/specs/README.md:27](/Users/rargu/DevPageOS-r015/docs/specs/README.md:27)

   **Observed:** README still says the card shows the name. The spec index still says owner approval is pending. README also omits the local email setup and fixture behavior.

   **Fix:** Correct these statements and document the local file format, missing-file behavior, fixture selection, and privacy-check command.

**Observed verification:** `npm run lint`, `tsc --noEmit`, and `git diff --check` passed. Five in-memory Email initialization assertions passed. Python checks confirmed all five summaries match the approved copy and word limits. The historical address and local part have no current tracked-file matches. Existing build folders have no full-address matches. Mock hashes match their README entries.

Source inspection found the R1 removals, R5 preservation, Copy-handler removal, and runtime initialization in place. Existing navigation, Reset, focus, reduced-motion, and `/p/` tests remain. The CastleSiege gap bound has a quarter-pixel rationale; that edit alone does not establish a defect.

**Not checked:** Fresh builds, `npm test`, e2e, browser geometry, rendered contrast, performance, mock screenshot comparison, mock regeneration, printing, or mail-client launch. Those commands write files, read private content, or require browser/network activity. I did not read `content/private/`, modify files, or perform network, device, or deploy actions. The private file’s current contents and existing build provenance remain unverified.