# Spec 003 T2–T5: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16a1d-0213-7271-8e13-ed75cb57ba40 · **Tokens:** 152,538
- **Date:** 2026-10-23 · **Scope:** committed range `a0c8a42~1..67c4ba6` (T2–T5)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Switching to Bot leaves a Hot-seat move target active (R5/R6) | Accepted (sheet-gated fix). |
| 2 | Keyboard users cannot scroll the rules panel (R4, 001 R19) | Accepted. |
| 3 | T5 tests do not prove cancellation during a live search, or that the search gets the new options (R5) | Accepted. |
| 4 | The reload test turns Music off before checking its reset (R1.b) | Accepted. |

Codex found no ungated behaviour change (R13) and judged `innerHTML` of the build-time rules HTML acceptable.

## Codex output (verbatim)

Reviewed `a0c8a42~1..67c4ba6`. No High findings. All references below use commit `67c4ba6`, excluding concurrent workspace edits.

**Observed** evidence comes from `git diff`, `git show`, `nl -ba`, and `rg`. Runtime consequences are **derived**, not browser reproductions.

1. **Medium — Switching to Bot leaves a Hot-seat move target active**

   [main.ts:1094](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:1094), [main.ts:883](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:883)

   **Observed:** `setOption()` changes the opponent and starts the bot without clearing `selected` or `targets`. The target-click path bypasses `canMove()`:

   ```ts
   if (selected && target) {
     act({ piece: target.piece, to: target.to }, false);
     return;
   }
   ```

   **Derived:** In Hot-seat, select a Black piece on Black’s turn. Switch to Bot, then click its existing target before the reply. The visitor can move Black while the bot thinks. The pending bot result then targets an outdated position.

   This leaves R5/R6 incomplete: the opponent selection and board controls disagree. This is inherited behavior, not a new old-OS regression.

   **Fix:** On the sheet, clear the selection when changing opponents. Also guard target execution with the current movement permission. Add this sequence to the opponent test. Preserve the old-OS path under R13.

2. **Medium — Keyboard users cannot reach the rules panel’s scrolling text**

   [rules-panel.ts:11](/Users/rargu/DevPageOS/src/apps/castlesiege/rules-panel.ts:11), [window.ts:703](/Users/rargu/DevPageOS/src/sheet/host/window.ts:703)

   **Observed:** The panel appends a plain document:

   ```ts
   const doc = document.createElement("div");
   doc.className = "cs-rules";
   doc.innerHTML = html;
   panel.root.append(doc);
   ```

   The host focuses `panel.box`. Its Tab trap lists explicit controls, excluding the scrolling `.host-child`. The current rules have no links or other controls. The host also prevents scroll keys when no ancestor of the focused element can scroll ([window.ts:306](/Users/rargu/DevPageOS/src/sheet/host/window.ts:306)).

   **Derived:** Keyboard focus stays on the dialog box or Close button. Neither is inside the scrolling text. PageDown and arrow keys cannot reveal the remaining rules. The R4 test only checks overflow dimensions:

   ```ts
   body.scrollHeight > body.clientHeight
   ```

   That does not prove usable scrolling.

   **Fix:** Make the scrolling child root focusable and focus it after inserting the document. Test keyboard scrolling to the final paragraph, Escape, and focus restoration.

3. **Medium — T5 tests do not prove cancellation during search or actual search options**

   [castlesiege-sheet.spec.ts:409](/Users/rargu/DevPageOS/tests/e2e/castlesiege-sheet.spec.ts:409), [castlesiege-sheet.spec.ts:429](/Users/rargu/DevPageOS/tests/e2e/castlesiege-sheet.spec.ts:429)

   **Observed:** The cancellation test installs and pauses the browser clock:

   ```ts
   await page.clock.install();
   await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
   ```

   Playwright also replaces `performance` ([types.d.ts:20468](/Users/rargu/DevPageOS/node_modules/playwright-core/types/types.d.ts:20468)). The bot yields only when its clock advances by the slice duration ([bot.ts:110](/Users/rargu/DevPageOS/src/apps/castlesiege/bot.ts:110)).

   **Derived:** With time frozen, the search does not yield through its normal timed slices. This exercises cancellation during the minimum reply delay, not during a live search slice. The session unit test checks `hot.cancel`, without running a pending reply.

   **Observed:** The level/style section checks menu marks, move count, and:

   ```ts
   "Vs bot · Normal · Aggressive · Move 4"
   ```

   **Derived:** It still passes if `think()` always receives Easy and Balanced. It also changes settings before starting the search, so it does not verify that an existing search retains its original options.

   **Fix:** Add an app-level test with a controlled, deferred `think()`. Inspect its arguments and abort signal. Cover cancellation during search and delay, replacement through Open/New Game, and stale completion after a replacement. Change level/style during one search and verify the following search receives them. This closes the R5/T5 verification gaps without relying on machine speed.

4. **Low — The reload test resets Music before checking its reset**

   [castlesiege-sheet.spec.ts:97](/Users/rargu/DevPageOS/tests/e2e/castlesiege-sheet.spec.ts:97)

   **Observed:**

   ```ts
   await chooseMenu(page, "castlesiege", "Options", "Music");
   expect(await musicChecked(page)).toBe(true);
   await chooseMenu(page, "castlesiege", "Options", "Music");
   ```

   **Derived:** Music is already off before reload. The final “Music off” assertion cannot detect failure to reset an enabled setting, as R1 requires.

   **Fix:** Leave Music enabled until reload. Keep the config-file and browser-storage assertions.

The remaining checks found no additional defect:

- **R13:** No ungated behavior change found by static comparison. The shared About text is identical. `store()` retains the same `saveConfig()` call off-sheet. `noUndo()` retains the original expression. `setOptions()` retains the original save copy, while cancellation is sheet-gated.
- **R1:** The sheet skips `loadConfig()`, uses `newSave()`, and suppresses every config write through `store()`. Assigning `config.game` or `config.from` in memory does not write an autosave. Valid Save/Open paths remain connected.
- **R4/R12:** Menu labels and order match. The host makes the rules child modal and handles Escape. Play online calls `openExternal()`, which uses `window.open(url, "_blank", "noopener,noreferrer")`.
- **HTML:** `renderMarkdown()` drops raw HTML, filters link schemes, and escapes attributes. `innerHTML` is acceptable for this fixed build-time source. A read-only `rulesHtml()` call found no anchors, images, or prohibited tags in the current output. The inaccurate sheet instructions remain the owner item already recorded at [spec.md:120](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:120).
- **Menu state:** Music is absent from `menuState()`, but its only mutation explicitly calls `buildMenu()`. No missing rebuild condition found. Replacement closes an open menu and restores prior focus through the host. Normal bot replies do not rebuild when the displayed state stays unchanged.
- **Cancellation:** Source tracing shows abort checks both inside `think()` and after the minimum delay. Open/New Game call `stopBot()`. Level/style are captured for each search.
- **Tests:** The new sheet interactions use real clicks and keys. `setFiles()` appropriately supplies import bytes. The principal test risks are the false assurances described above.
- **Budget:** The ledger records 97.8 KiB, leaving approximately 2.2 KiB. The guard counts registered apps and rejects totals above 100 KiB. Build-time `marked` avoids a runtime parser import. No dependency change appears in this range.

**What I could not check:** Browser reproduction, actual keyboard scrolling, focus and layout across browsers, download activation, timing, or a fresh budget measurement. I ran no tests, build, lint, network, deploy, git-write, or file-write commands.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/003-castlesiege-live/spec.md (all, incl. "Advisor decisions" and notes) and tasks.md (rows T2–T5); docs/review/spec-003-critique-codex.md
- docs/specs/002-app-host/spec.md (Boundaries, "Lead notes"), docs/specs/001-sheet/spec.md R22 (budget)
- The change under review: committed range `git diff a0c8a42~1..67c4ba6` (003 T2–T5: sheet defaults and no autosave, wide-layout tests, sheet menu row + rules panel with build-time marked + Play online, opponent switch + menu state). Read src/apps/castlesiege/main.ts, session.ts, rules-panel.ts, styles.css, scripts/host-resources.ts, src/apps/resume/doc.ts (renderMarkdown), and the tests tests/e2e/castlesiege-sheet.spec.ts, tests/e2e/castlesiege.spec.ts, tests/unit/castlesiege/session.test.ts, tests/unit/host-fs.test.ts.

Task: review T2–T5. Check:
1. every sheet-only change is gated on os.env.DISPLAY === "sheet" and the old OS CastleSiege is unchanged (R13) — list any ungated behaviour change (e.g. shared About text, the `store()` refactor, `noUndo()`);
2. R1: defaults on every start; no autosave of the game or config.from on the sheet; explicit Save/Open still work;
3. R4 menu order/labels exactly; rules panel (child window, modal, Esc, scroll); the build-time HTML: safety (renderMarkdown drops raw HTML? links safe?), and the HTML is inserted how (innerHTML?) — acceptable given it is build-time content?;
4. R12: no request to castlesiege.fly.dev by the sheet; openExternal path;
5. R5/R6: Hot-seat cancels a pending reply in every state (waiting in the minimum delay, mid-search, after Open…/New Game); level/style apply to the next search; menu rebuild conditions complete (any state the menu shows that is missed? Music?), rebuild while a menu is open, focus;
6. tests that cannot fail, page.clock use, synthetic input, flakiness risks;
7. budget (97.8 KiB of 100).

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, old OS unchanged. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
