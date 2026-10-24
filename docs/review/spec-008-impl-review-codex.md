# Spec 008: Codex implementation review (T3)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16ab0-c757-7431-9370-dae5a700dd47 · **Tokens:** 188,151
- **Date:** 2026-10-24 · **Scope:** `a7f13d0..4278435` (T1+T2)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | The popup-close rule reaches every old-OS app (R5) | Accepted. Limited to CastleSiege. |
| 2 | Compact-mode menus stay open and stale (R2) | Accepted. |
| 3 | Focus after closure goes to `.win-client`, and can steal focus from another window (R2, R5) | Accepted. |
| 4 | R4.c checks signals but not that playback cannot resume | Accepted. |
| 5 | No test with Sound and Music both on (or Sound off, Music on) for the win effect | Accepted. |
| 6 | R2 Flip and New Game level checks incomplete | Accepted. |

## Codex output (verbatim)

Source evidence is **observed** through `git diff a7f13d0..HEAD`, `nl -ba`, and `rg -n`. Failure cases below are **derived** from that source. No High finding.

1. **Medium — The popup rule changes unrelated apps.**  
   [src/wm/window.ts:122](/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/wt-008/src/wm/window.ts:122)

   **Observed:** `"shown !== this.menuShown ? this.menuPopup : null"` applies to every window. Tracker rebuilds its menu when pattern length changes (`src/apps/tracker/main.ts:1041`). Playback changes the current pattern and calls `render()` (`:170`).

   **Derived:** Play a song with successive 16-row and 32-row patterns, then open File. The pattern change closes File, although nothing in that popup changed. This exceeds R5’s CastleSiege-only exception. The ledger acknowledges the broader behavior at `docs/ledger/2026-10-24-spec-008.md:27`, but records no separate approval.

   **Fix:** Limit the new close behavior to CastleSiege. Add a Tracker regression that preserves its File popup across this transition.

2. **Medium — Compact mode keeps a stale menu open.**  
   [src/wm/window.ts:124](/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/wt-008/src/wm/window.ts:124)

   **Observed:** `setMenu()` closes only `menuPopup`. That handle is assigned inside the desktop menubar code (`:409`). Compact mode instead calls `"actionSheet(items, { title: win.title })"` and discards its handle (`src/wm/wm.ts:786`).

   **Derived:** At phone size, start as Black, hold the bot’s first reply, and open Menu → Game. Releasing the reply leaves the sheet open with Undo disabled. R2’s menu freshness and closure behavior remains incomplete.

   **Fix:** Track the window’s compact menu too. Close it on CastleSiege state changes and restore focus. Add the compact equivalent of R2.b.

3. **Medium — Popup closure restores focus to the wrong place.**  
   [src/wm/window.ts:126](/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/wt-008/src/wm/window.ts:126)

   **Observed:** The fallback calls `"this.root.focus()"`. This root is `.win-client` (`:87`). CastleSiege handles board arrow keys on its child `.cs` element (`src/apps/castlesiege/main.ts:941`). Popup closure also restores its previous focus unconditionally when connected (`src/ui/menu.ts:75`).

   **Derived:** After R2.b’s closure, arrow keys do not reach CastleSiege’s handler. There is also a background case: open Game, Alt+Tab to Writer, then release the bot reply. The popup closes and takes DOM focus back to CastleSiege while the window server still identifies Writer as focused. These undermine R2’s focus recovery and R5.

   **Fix:** Preserve external focus when the visitor has switched windows. When the popup still owns focus, restore CastleSiege’s `.cs` element or a board cell. Test arrow-key play after closure and focus preservation after Alt+Tab. The current assertion only checks `activeElement.closest(WIN)` (`tests/e2e/castlesiege.spec.ts:866`).

4. **Low — R4.c checks cancellation signals without proving playback cannot resume.**  
   [tests/e2e/castlesiege.spec.ts:1169](/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/wt-008/tests/e2e/castlesiege.spec.ts:1169)

   **Observed:** After `"letEngine()"`, the test immediately enables Music again. Subsequent assertions inspect `__csMusic` records and `signal.aborted` (`:1172`, `:1185`). Those records are created before the engine loads (`src/apps/castlesiege/music.ts:24`).

   **Derived:** The test cannot distinguish resumed audio from the cancelled request and legitimate playback from the new request. It also does not establish that victory playback has started before stopping it.

   **Fix:** Keep Music off after releasing the engine. Await engine completion and assert that no audio sources start. Establish actual victory playback before testing its stop. Existing helper unit tests provide useful cancellation coverage, so this is a test-strength finding, not evidence of a playback bug.

5. **Low — The new sound-effect behavior lacks tests for both options together.**  
   [tests/e2e/castlesiege.spec.ts:1076](/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/wt-008/tests/e2e/castlesiege.spec.ts:1076)

   **Observed:** R4.a disables Sound while system sounds remain disabled. R4.b enables system sounds but leaves Music off. The implementation now calls `"sound(\"win\")"` alongside victory music (`src/apps/castlesiege/main.ts:762`).

   **Derived:** Neither test detects a regression that suppresses the short effect whenever Music is on. They also miss Sound-off effects leaking through when system sounds are enabled. These are R4 behaviors.

   **Fix:** With system sounds enabled, test a win with both options on. Then test Sound off with Music on. Assert the effect and song independently.

6. **Low — R2’s Flip and New Game checks are incomplete.**  
   [tests/e2e/castlesiege.spec.ts:829](/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/wt-008/tests/e2e/castlesiege.spec.ts:829)

   **Observed:** After New Game, the test checks Opponent and Undo only (`:837`). It retains the existing level and style. No old-OS test exercises Flip board’s checkmark.

   **Derived:** A stale Flip check, or stale level check after selecting another New Game level, can pass this suite. R2 and R2.a require those checks to match.

   **Fix:** Toggle Flip and verify its check and reset. Select a different New Game level, then verify Opponent, level, and style.

**Other requested checks**

- **Observed:** `MenuItem` supports labels, shortcuts, disabled/checked flags, actions, children, and separators (`src/sdk/os.d.ts:200`). It has no icon or radio-group fields. Exclusive choices use `checked`.
- **Derived:** JSON includes nested submenu checks and separators, but drops actions. Function-only changes can therefore retain old callbacks. It also distinguishes omitted flags from `false`, and different property orders, despite identical rendering. I found no bundled menubar caller that demonstrates those representation-only cases.
- **Observed:** An equal comparison still replaces the bar (`src/wm/window.ts:125`). A preserved popup retains its detached anchor and navigation closure. This limitation predates the reviewed range.
- **Derived:** The motion listener uses one cached query and stable callback. System registers it, forced settings remove it, and Settings changes reach `applyMotion()` (`src/wm/wm.ts:249`, `:265`). No listener growth follows from the normal page lifecycle.
- **Observed:** `.no-motion` remains only in two CSS selectors, each paired with `[data-motion="reduced"]` (`src/apps/castlesiege/styles.css:110`, `:423`). No remaining code requires the class.
- **Derived:** Lesson cancellation remains unchanged through `!lesson`. Sheet behavior also remains equivalent: its sound capability returns false (`src/sheet/host/os.ts:224`), and its existing mode-selection behavior stays gated.
- **Observed:** `__csThink` and `__csMusic` remain guarded by `MODE === "e2e"`. New tests add no fixed sleeps. Existing waits remain at `castlesiege.spec.ts:168`, `:333`, `:376`, and `:378`.

All test references below are in `tests/e2e/castlesiege.spec.ts`. “Coverage” means source inspection, not an executed result.

| Requirement | Test | Coverage / failure check |
|---|---|---|
| R1 / R1.a | `:682`, search and delay variants | Aborted signal, stale release, exact displayed board/history, cleared targets, Black move |
| R1.b | `:720` | Same-mode selection retained; changed mode clears it |
| R1.c | `:737` | Held lesson search stays active and applies exactly one reply |
| R2 / R2.a | `:776` | Undo/menu/shortcut and Open checks; gaps in finding 6 |
| R2.b | `:841` | Desktop popup closes and Undo updates; compact and focus gaps in findings 2–3 |
| R3 / R3.a | `:949` | Live preference changes; paused slide/victory stop at their end state |
| R3.b | `:1007` | Forced settings override browser preference; System resumes |
| R4 / R4.a | `:1069` | Song requests survive Sound toggles |
| R4.b | `:1096` | Music-off win requests no song and creates four effect notes |
| R4.c | `:1134` | Abort signals and finished-game silence; playback gap in finding 4 |
| R4.d | `:1198` | Saved checks and startup theme request survive restart |
| R5 / R5.a | Existing sheet/performance suites; updated music test `:353` | Sheet tests unchanged; global menu scope violates R5 in finding 1 |

**Verdict:** Fix findings 1–3 before completing T3.

**Could not check:** Runtime reproduction, actual audio, browser timing, lint, unit/e2e results, production hook removal, or the ledger’s reported passes. Per instruction, I ran no tests or network calls and modified no files.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS / RArgu OS (the repo in the current directory). Do not modify files.

Read first: AGENTS.md; docs/specs/008-old-os-castlesiege-fixes/spec.md (approved) and tasks.md; docs/review/spec-008-critique-codex.md; docs/ledger/2026-10-24-spec-008.md; docs/specs/003-castlesiege-live/spec.md (sheet versions).
The change under review: committed range `git diff a7f13d0..HEAD` (008 T1+T2). Read every changed file: src/apps/castlesiege/main.ts, src/wm/wm.ts, src/wm/window.ts, system/usr/share/doc/castlesiege.md, tests/e2e/castlesiege.spec.ts.

Task: implementation review of spec 008. Check: (1) R1–R4 and every acceptance check R1.a–R4.d against the code, each with a test that can fail; (2) R5: no sheet behaviour change and no old-OS change beyond R1–R4 — in particular the setMenu popup-close rule in src/wm/window.ts now affects every old-OS app: is the JSON comparison correct (functions dropped, icons, submenus, radio groups, separators), can it close a popup the visitor is using when nothing visible changed, can it fail to close a stale popup? Focus handling; (3) the wm.ts listener: added/removed correctly, no leak, Settings changes; (4) removing `.no-motion`: any CSS or code that still depends on it on either OS; (5) music: songs follow Music; Sound effects; both sounds on a win; pending/cancelled playback; restart restoring saved values; (6) lessons unaffected; (7) test quality: tests that cannot fail, sleeps, hooks only in e2e builds.
Constraints: static site, no deploy, no push, no new dependencies. Read-only commands only; no tests, no network.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence (quote), why it is wrong against which requirement, and a fix. Keep observed facts apart from inference. Then a short requirement -> test table. End with what you could not check.
