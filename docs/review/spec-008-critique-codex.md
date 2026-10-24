# Spec 008 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16a84-5a21-7312-b260-a665ed9017ea · **Tokens:** 109,879
- **Date:** 2026-10-24 · **Commit:** `3688bfd` (draft spec)

## Dispositions

| # | Sev | Finding | Disposition | Change |
|---|---|---|---|---|
| 1 | High | R3 needs a live preference source; the old OS has no media listener | Accepted | R3 defines System/On/Off; `wm.ts` listener in Approach; R3.a/R3.b. |
| 2 | Medium | R5 would keep an old test that expects the tune R4 removes | Accepted | R5.a authorizes updating that test. |
| 3 | Medium | R4 acceptance misses Sound-off/Music-on, the win effect, pending playback, restart | Accepted | R4.a–R4.d; assumption 2 replaced with the code evidence. |
| 4 | Medium | Removing the cancel guard changes Guide lessons | Accepted | R1 limited to ordinary games; R1.c lesson regression. |
| 5 | Medium | A rebuild does not update an open popup | Accepted | R2 closes the popup, focus to the window; R2.b; `window.ts` in Approach. |
| 6 | Medium | R1.a does not prove both phases or exact position | Accepted | R1.a search and delay phases, stale release, snapshots; R1.b same-mode. |
| 7 | Low | Old-OS rules text says Sound controls the victory tune | Accepted | R4 corrects `castlesiege.md`. |
| 8 | Low | R5 baseline must include the owner's 2026-10-24 sheet changes | Accepted | R5 baseline stated; 003 R13 superseded only for R1–R4. |

## Codex output (verbatim)

Evidence marked **Observed** comes from `git show HEAD:<path> | nl -ba`, at HEAD `3688bfd`. Draft documents were read with `nl -ba`. Uncommitted code changes were excluded.

1. **High — R3 needs a live preference source.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:55`

   **Observed:** `reducedMotion()` reads `html.dataset.motion` (`src/ui/dom.ts:88`). The old OS updates that attribute during settings or display updates, but has no browser preference-change listener (`src/wm/wm.ts:194`, `:249`, `:258`). The sheet has that listener (`src/sheet/host/styles.ts:62`).

   **Derived:** Removing the startup `.no-motion` class, or refreshing it during render, cannot make browser preference changes apply immediately.

   **Spec fix:** Define the effective preference, including the old OS’s System/On/Off override. Authorize the necessary listener and cleanup. Require `page.emulateMedia()` changes without a resize or settings event, plus checks that forced On/Off settings remain respected.

2. **Medium — R5 requires an existing test to preserve the behavior R4 removes.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:49`

   **Observed:** The old-OS music test wins with default Music off and expects the victory tune (`tests/e2e/castlesiege.spec.ts:391`, `:396`). R4 forbids that tune.

   **Derived:** The proposed implementation cannot pass the existing old-OS suite unchanged.

   **Spec fix:** Explicitly authorize updating this test. Enable Music before its music-enabled win, and add a separate default-Music-off win check. Preserve its minimize, restore, lesson and close checks.

3. **Medium — R4’s acceptance omits several promised outcomes.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:46`

   **Observed:** Before the change, the theme requires both Sound and Music (`src/apps/castlesiege/main.ts:554`, `:567`). Returning `config.music` also enables the theme when Sound is off. The win branch then chooses victory music instead of the short win effect (`:761`). R4.a does not check stopping victory music or cancelling pending playback.

   **Spec fix:** Add explicit checks for:

   - Sound off/Music on: theme and victory music play. Sound toggles do not stop them.
   - Music off: neither song starts. Sound still controls effects, including the short win effect.
   - Music off during victory or pending playback: the signal aborts and playback cannot resume.
   - Music on after a finished game: no song starts.
   - Saved Sound/Music values survive restart, with the expected startup playback.

   **Observed:** Both menu options and persistence already exist (`main.ts:135`, `:1262`, `:1273`; `tests/e2e/castlesiege.spec.ts:406`, `:498`). Replace assumption 3 with that evidence. No config-format change is needed.

4. **Medium — Removing the cancellation guard also changes Guide lessons.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:54`

   **Observed:** `setOptions()` computes cancellation from the saved opponent mode (`src/apps/castlesiege/session.ts:91`). During lessons, `botWanted()` instead follows the lesson board and ignores that mode (`main.ts:779`). `setOption()` cancels, then calls `botTurn()` (`:1155`, `:1164`).

   **Derived:** Selecting Hot-seat during a lesson’s bot search aborts that search and immediately starts another. Later level/style actions can repeat this when the saved mode remains Hot-seat. This differs from the old OS and from R1’s promised cancellation.

   **Spec fix:** Limit R1’s opponent-switch changes to ordinary games, or explicitly specify lesson behavior. Add a lesson regression that covers opponent actions during a held search.

5. **Medium — Rebuilding the menu does not update an already-open popup.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:29`

   **Observed:** `setMenu()` replaces the menu bar (`src/wm/window.ts:111`, `:376`). Its open popup retains the original items and callbacks (`:396`; `src/ui/menu.ts:131`). Closing restores focus only if the original element remains connected (`src/ui/menu.ts:75`).

   **Derived:** Start as human Black, hold the bot’s first reply, and open Game. When that reply arrives, the new bar enables Undo, but the existing popup still shows disabled Undo. Its original anchor is detached.

   **Spec fix:** Define whether a state change refreshes or closes an open menu, and where focus goes. Add this held-first-reply case. Explicitly authorize any necessary window/menu change.

6. **Medium — R1.a does not require proof of both cancellation phases or position preservation.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:36`

   **Observed:** R1.a checks a generic “pending” reply and move count. The sheet has separate held-search and reply-delay cases, including release of a stale result (`tests/e2e/castlesiege-sheet.spec.ts:893`, `:920`, `:971`). Clearing selection applies to every opponent-menu action, including selecting the already-checked mode (`main.ts:1157`).

   **Spec fix:** Require separate search and delay cases. Release the cancelled result, advance time, and compare exact board/history snapshots. Check selection and targets, then prove the visitor can move Black. Specify whether selecting the current mode also clears a valid selection.

   **Derived:** Clearing selection also masks the target-ownership guard in the proposed scenario. Describe that guard as defensive unless a separate reachable case demonstrates it.

7. **Low — R4 leaves the old OS’s instructions incorrect.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:31`

   **Observed:** The old-OS rules explicitly say Sound controls the victory tune and Music adds only the theme (`system/usr/share/doc/castlesiege.md:64`). Old-OS Help still opens these instructions (`src/apps/castlesiege/main.ts:1304`).

   **Spec fix:** Include this content correction in R4. State that Sound controls effects and Music controls both songs.

8. **Low — R5 needs a baseline that accommodates the separate approved rules removal.**  
   `docs/specs/008-old-os-castlesiege-fixes/spec.md:65`

   **Observed:** R5 requires unchanged sheet tests. The owner separately approved removing the sheet’s rules items and panel (`docs/OWNER_QUESTIONS.md:63`). HEAD’s sheet test requires those items and panel (`tests/e2e/castlesiege-sheet.spec.ts:330`, `:337`).

   **Spec fix:** Require no additional sheet changes from 008, relative to the integrated rules-removal baseline. Explicitly supersede 003 R13 only for 008’s approved old-OS changes.

The `/` test route and existing hooks are suitable: `tests/e2e/helpers.ts:21` boots `/`, and `__csThink`/`__csMusic` are gated on e2e mode. Require a local e2e build so an existing production server cannot supply missing hooks (`playwright.config.ts:18`, `:20`).

Fix these points before owner approval. The static-site, no-push, no-deploy and config-format boundaries are otherwise sensible.

**Could not check:** Runtime behavior, actual audio, browser timing, failing-test demonstrations or production hook removal. Per instruction, I ran no tests, made no network calls and modified no files.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (the RArgu OS site). Do not modify files.

Read first: AGENTS.md; the draft spec docs/specs/008-old-os-castlesiege-fixes/spec.md; docs/specs/003-castlesiege-live/spec.md (R5, R6, R7, R9, R13 and notes); docs/specs/README.md; docs/OWNER_QUESTIONS.md (rows of 2026-10-24); the code src/apps/castlesiege/main.ts (every `onSheet` use), session.ts, music.ts, styles.css; the tests tests/e2e/castlesiege.spec.ts (old OS) and tests/e2e/castlesiege-sheet.spec.ts (sheet). Note: another change is in progress in the working tree (removing the sheet's rules panel); review the spec against HEAD's code and ignore uncommitted diffs.

Task: critique the draft spec 008 before owner approval. Check: (1) does each requirement describe the real bug correctly (read the code and the sheet tests) and is each acceptance check able to fail? (2) are there other places where removing the guard changes old-OS behaviour beyond R1–R4 (side effects of the menu rebuild, of clearing the selection, of live no-motion, of songs() on the old OS's Sound option, of startup/config)? (3) is anything missing (e.g. Music option existence on the old OS, persistence of the Music setting in the old OS config, a Sound-only UI that now does less, R4's effect when Sound is off and Music is on)? (4) boundaries and out-of-scope sensible; (5) test approach (old OS at `/`, hooks only in e2e builds). Constraints: static site, no deploy, no push, old OS changes only as the spec says. Read-only commands only; no tests, no network.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence, and a concrete spec fix. Keep observed facts apart from inference. End with what you could not check.
