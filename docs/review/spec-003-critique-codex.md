# Spec 003 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166de-ecb2-7b11-b4eb-1c66d6713101 · **Tokens:** 160,670
- **Date:** 2026-10-22 · **Commit:** c3af2d4 + uncommitted spec drafts

## Dispositions

Checked by Claude: `castlesiege/main.ts:1073-1079` (How to play → Guide/Reader), `system/usr/share/doc/castlesiege.md`
exists, `session.ts:40-41` (defaults Easy/Balanced), `bot.ts` slicing. All accepted.

| # | Sev | Disposition | Change |
|---|---|---|---|
| 1 | High | Accepted | R4: How to play / Rules open an in-window panel with `castlesiege.md`. |
| 2 | High | Accepted | R5: opponent change keeps position; Hot-seat cancels pending bot reply. |
| 3 | Medium | Accepted | R6: menu, shortcuts and side controls agree. |
| 4 | Medium | Accepted | R1: autosave and `config.from` off; defaults each start. |
| 5 | Medium | Accepted | R2: 63 cells, 6 reference entries, no clipping, 16 px text, measured size. |
| 6 | Medium | Accepted | R7: Music off stops either song. |
| 7 | Medium | Accepted | R7.a uses a test hook on CastleSiege's player, not the shared AudioContext. |
| 8 | Medium | Accepted | Assumption 3 + R8: existing slicing, named profile, injected-task proof. |
| 9 | Medium | Accepted | R9: victory animations and live preference changes. |
| 10 | Medium | Accepted | R10: non-default round trip, corrupt file. |
| 11 | Medium | Accepted | R11: history scroll never moves the sheet view or focus. |
| 12 | Medium | Accepted | R13 + 002 R15: one marker `env.DISPLAY === "sheet"`. |
| 13 | Low | Accepted | Assumption 1 corrected (compact policy vs width). |

## Codex output (verbatim)

Revise spec 003 before approval. The main gaps are Help behavior, opponent changes during bot search, and checks that accept broken controls.

**Observed** evidence comes from read-only `nl -ba`, `rg -n`, and `rg --files` commands. Consequences below are labeled **Derived**. Browser behavior remains **Unverified**.

1. **High — Help retains actions that cannot work.** [003/spec.md:31](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:31)

   **Observed:** R4 keeps “How to play” and “Rules” while removing Reader actions. Both currently require Reader when lessons are absent (`src/apps/castlesiege/main.ts:1073`, `:1188`). Spec 002 excludes Reader (`docs/specs/002-app-host/spec.md:150`). The resource list omits the rules document (`003/spec.md:64`).

   **Derived:** Keeping the existing handlers produces silent failures. Removing those items contradicts R4. R4.a checks labels only.

   **Spec fix:** State: “How to play and Rules show bundled instructions inside CastleSiege through host panels.” Name the content source, `/usr/share/doc/castlesiege.md`, and add checks that activate both items and inspect their content. Keep Reader and Guide outside 002.

2. **High — Opponent switching assumes behavior the code does not provide.** [003/spec.md:32](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:32)

   **Observed:** `setOption` changes the existing save without resetting the position or canceling search (`src/apps/castlesiege/main.ts:1084`). A pending bot result still calls `act(action, true)` after the mode changes (`:799`). New Game uses a separate reset path (`:1017`).

   **Derived:** “Starts a two-player game” leaves reset behavior unclear. Switching during thought can still produce a bot move. R5.a misses this case.

   **Spec fix:** Replace R5 with: “Changing Opponent preserves the position and history. Switching to Hot-seat cancels any pending bot reply.” State that level/style changes affect the next search. Test changes from a nonempty game, during search, and during the minimum reply delay.

3. **Medium — The menu check accepts an existing broken Undo state.** [003/spec.md:47](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:47)

   **Observed:** `buildMenu` captures Undo’s disabled state (`src/apps/castlesiege/main.ts:1103`). Ordinary moves call `render`, without rebuilding the menu (`:754`). The shared menu refuses disabled actions (`src/ui/menu.ts:106`). Existing e2e tests use the side-panel Undo button (`tests/e2e/castlesiege.spec.ts:108`).

   **Derived:** After the first moves, the side button can work while Game → Undo and its shortcut remain disabled. R4.a still passes.

   **Spec fix:** Add: “Menu actions, shortcuts, and side controls agree with current game state.” Test Undo after a bot reply, after undoing to the start, and during thought. Also test Flip board and the actual level/style selections.

4. **Medium — Skipping startup restore does not remove autosaving.** [003/spec.md:28](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:28)

   **Observed:** The approach only says to skip loading the saved game (`003/spec.md:67`). `persist` still writes the whole game (`src/apps/castlesiege/main.ts:715`). Open also writes `config.from` and the configuration (`:1054`). Music settings load from that same configuration (`:128`).

   **Derived:** Reloading can pass R1.b because 002 clears memory, while the app still keeps an autosave during the visit. Restarted apps can also retain Music settings unless explicitly reset.

   **Spec fix:** Say: “On the sheet, disable automatic game and source-path persistence. Explicit Open remains allowed. Each app start uses Easy, Balanced, White, and Music off.” State the lifetime of settings during one running game. Check restart behavior and configuration writes, alongside reload.

5. **Medium — A `wide` class does not prove the required layout fits.** [003/spec.md:29](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:29)

   **Observed:** Width alone sets `wide` and `roomy` (`src/apps/castlesiege/main.ts:330`). Cell size also depends on height (`:317`). `roomy` caps the main area at 600 app px and reserves 280 px for the side panel (`src/apps/castlesiege/styles.css:205`). Spec 001 reserves 388 px for the demo (`docs/specs/001-sheet/spec.md:147`).

   **Derived:** Both class checks can pass with a smaller board, clipped reference content, or incorrect inherited text size. Under the existing styles, a 388 px demo cannot accommodate nine 40 px cells, their frame, main padding, and status bar.

   **Spec fix:** Record measured app-body dimensions, menu height, cell size, and resulting outer height. Assert `--u = 1px`, 16 px app text, all 63 cells, six reference entries, usable controls, and no clipping. Repeat at desktop and phone fit. Preserve the binding shared ~620 px window decision (`docs/OWNER_QUESTIONS.md:43`).

6. **Medium — Music off does not currently stop victory music.** [003/spec.md:33](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:33)

   **Observed:** The proposed change gates victory playback on `config.music` (`003/spec.md:67`). However, `syncMusic` only stops a victory track when the game leaves the won state (`src/apps/castlesiege/main.ts:556`). Turning Music off during victory does neither (`:1174`).

   **Derived:** The proposed initiation check permits music to continue after the visitor turns Music off.

   **Spec fix:** Add: “Music off stops either song immediately and cancels pending playback.” Define whether enabling Music after a finished game starts victory music. Test disabling during theme playback, victory playback, and delayed loading. Retain old-OS music behavior at `/`.

7. **Medium — The audio check measures the wrong thing and omits retry behavior.** [003/spec.md:51](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:51)

   **Observed:** Tracker and CastleSiege use the engine’s shared `AudioContext` (`src/apps/tracker/engine.ts:835`, `:986`). CastleSiege reaches it after an import and filesystem read (`src/apps/castlesiege/music.ts:24`). Resume errors are swallowed (`src/apps/tracker/engine.ts:840`). Spec 002 requires a usable second attempt (`docs/specs/002-app-host/spec.md:68`).

   **Derived:** A running context does not identify CastleSiege output. Tracker playback can fail R6.a while CastleSiege is correctly silent. Turning Music off need not suspend the shared context.

   **Spec fix:** Assert CastleSiege track starts and stops, rather than global context state. Test cold pointer and keyboard activation, rejected/suspended resume, and a visible retry. Test CastleSiege stopping while Tracker continues. Real browser activation behavior remains **Unverified**.

8. **Medium — The performance approach overlooks existing time slicing.** [003/spec.md:53](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:53)

   **Observed:** The bot already yields through macrotasks, targeting 12 ms slices (`src/apps/castlesiege/bot.ts:59`, `:89`, `:110`). Deeper searches still contain synchronous recursion (`src/apps/castlesiege/ai/alphabeta.ts:362`). Existing tests measure slices and cancellation (`tests/unit/castlesiege/bot.test.ts:68`). Installed Playwright types distinguish Chromium performance tracing from ordinary Playwright tracing (`node_modules/playwright-core/types/types.d.ts:11728`).

   **Derived:** “Main thread” does not mean an unsliced search. Three unspecified moves on unspecified hardware do not establish a repeatable budget.

   **Spec fix:** Describe the existing slicing first. Name the browser, device or CPU profile, positions, and task measurement method. Require three completed replies and window movement during search. Prove the check detects an injected task over 200 ms. Evaluate the existing slicing before proposing a Worker.

9. **Medium — Reduced-motion acceptance omits victory and live changes.** [003/spec.md:56](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:56)

   **Observed:** R8.a checks only piece movement. Victory has separate drop and flash animations (`src/apps/castlesiege/styles.css:398`). The app also captures `.no-motion` once at startup (`src/apps/castlesiege/main.ts:1323`).

   **Derived:** Victory can remain animated while R8.a passes. A startup `.no-motion` class can continue suppressing animation after the preference changes back.

   **Spec fix:** Test piece transitions, the victory drop, and title flashing. Cover reduced motion before load and preference changes during play and victory. Keep flag publication in 002 and CastleSiege’s response in 003.

10. **Medium — The file round trip can pass when Open does nothing.** [003/spec.md:57](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:57)

    **Observed:** R9.a saves and reopens without first changing the board. Saves contain mode, human side, level, style, and actions (`src/apps/castlesiege/session.ts:19`). Parsing rejects incompatible rules and illegal histories (`:114`, `:142`).

    **Derived:** A no-op Open preserves “the same position.” The check also misses damaged exports and lost settings.

    **Spec fix:** Download a game with nondefault settings, start a different game, then import the actual downloaded bytes. Compare settings, history, side to move, and position. Add cancellation and invalid-file cases with explicit expected behavior. Assign browser download activation and fallback mechanics to 002. Test this real Save path there too: it awaits `mkdir` before requesting a destination (`src/apps/castlesiege/main.ts:1029`). Browser results remain **Unverified**.

11. **Medium — Move-history scrolling can move the sheet unexpectedly.** [003/spec.md:34](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:34)

    **Observed:** Every render rebuilds history and calls `scrollIntoView` on its last row (`src/apps/castlesiege/main.ts:435`, `:453`). Bot replies trigger that render (`:755`).

    **Derived:** If the visitor pans elsewhere while the bot thinks, the reply can scroll outer ancestors and return the view to CastleSiege. None of the acceptance checks protects the visitor’s current view.

    **Spec fix:** Add: “History updates scroll only the move list. They never change the sheet view or keyboard focus.” Test a bot reply after panning elsewhere. Also test history preview and return to the live board.

12. **Medium — Missing Guide content is not a safe host check.** [003/spec.md:66](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:66)

    **Observed:** The approach permits detecting the sheet through “a missing Guide.” The old app explicitly supports missing lesson content by falling back to Reader (`src/apps/castlesiege/main.ts:1075`). Spec 002 lists `env.DISPLAY` but does not assign its sheet value (`docs/specs/002-app-host/spec.md:29`).

    **Derived:** Resource absence can select sheet behavior in the old OS, violating the preservation boundary.

    **Spec fix:** Require one explicit host marker, such as `env.DISPLAY === "sheet"`, and define it in 002. Gate sheet-only changes on that marker. Test old-OS behavior both with and without lesson content.

13. **Low — Assumption 1 confuses narrow width with compact policy.** [003/spec.md:15](/Users/rargu/DevPageOS/docs/specs/003-castlesiege-live/spec.md:15)

    **Observed:** The bottom bar appears only under `.cs.compact` (`src/apps/castlesiege/styles.css:274`, `:295`). Compact mode comes from `DISPLAY_POLICY`, not the 440 px threshold (`src/apps/castlesiege/main.ts:167`).

    **Spec fix:** Replace the final sentence with: “Compact policy shows Moves/Pieces buttons. Desktop policy below 440 app px retains a smaller side panel without the reference.” Keep the sheet on desktop policy, as 002 specifies.

**What I could not check:** No sheet host exists yet (`rg --files src/sheet` reports no directory). I did not run browsers, build, lint, or tests. Build and test commands generate files (`package.json:11`, `:13`, `:17`). Actual layout, browser audio/download rules, timings, and visual comparison remain **Unverified**. No network actions or file changes were made.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (the RArgu OS site). Do not modify files.

Read first: AGENTS.md; docs/specs/003-castlesiege-live/spec.md (the spec under review); docs/specs/001-sheet/spec.md and docs/specs/002-app-host/spec.md (the shell and the app host it depends on; both critiqued, read their critiques in docs/review/ too); docs/OWNER_QUESTIONS.md (owner decisions, binding; note the app-scale-1 row replaces an earlier phone row); src/apps/castlesiege/ (main.ts, session.ts, bot.ts, music.ts, styles.css, manifest.json, ai/), tests/e2e/castlesiege.spec.ts; src/sdk/os.d.ts; src/ui/dom.ts; src/ui/tokens.css.

Task: critique spec 003 before the owner approves it. Check that each requirement is right about the current code (cite path:line), testable, and that each acceptance check can fail. Look for: app behaviour the spec assumes but the code does not have (or the reverse); menu items, resources, settings or saved state the spec forgets; conflicts with 001/002 or the owner decisions; layout and size claims at scale 1 (--u = 1px); audio and download rules in browsers; performance; reduced motion; work that belongs in another spec.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
