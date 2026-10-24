# 008: Old-OS CastleSiege fixes

**Status:** Archived 2026-10-24 (spec 007 T7: 007 deletes the old OS that this spec fixed; the old code stays in the local tag `devpageos-final`, set in 007 T9); was Verified (local) 2026-10-24 (T1–T3, branch `spec-008-oldos`) · **Owner approval:** 2026-10-24 · **Gates needed:** none
**Related:** spec 003 (CastleSiege live; the sheet already has these fixes behind `onSheet`); spec 007 (deletes the
old OS later); morning report `docs/handoffs/MORNING_REPORT_2026-10-23.md` ("Old OS"); owner request 2026-10-24
("Fix the old-OS bugs too using our development process"); `docs/OWNER_QUESTIONS.md` rows of 2026-10-24; critique
`docs/review/spec-008-critique-codex.md` (8 findings, all accepted).

## Why

Spec 003 fixed four CastleSiege bugs on the sheet but left them on the old OS at `/`, because 003 R13 kept the old OS
unchanged. The owner asked for the old OS to get the same fixes. The old OS stays live at `/` until spec 007, so
visitors meet these bugs until then. Most fixes already exist and are tested on the sheet; this spec applies the same
behaviour on the old OS, with old-OS tests, and adds the two small old-OS pieces the sheet did not need (a live
reduced-motion listener and closing an open menu on a rebuild).

## Assumptions

1. The guards are at `src/apps/castlesiege/main.ts:924`, `:532`, `:1154`, `:1156`, `:553`, `:1430` (HEAD `3688bfd`).
   [Code] Line numbers move with the 2026-10-24 rules-removal change; T1 re-reads them.
2. The old OS has both a Sound and a Music option, and saves both in its config (`main.ts:135`, `:1262`, `:1273`;
   `tests/e2e/castlesiege.spec.ts:406`, `:498`). [Code] No config-format change is needed.
3. `reducedMotion()` reads `html.dataset.motion` (`src/ui/dom.ts:88`). The old OS sets it from its Settings
   (System / On / Off) on settings and display updates, but does not listen to the browser preference
   (`src/wm/wm.ts:194`, `:249`, `:258`). [Code]
4. On the old OS, `setMenu()` replaces the menu bar but an open popup keeps its old items (`src/wm/window.ts:111`,
   `:376`, `:396`; `src/ui/menu.ts:131`). [Code]
5. During a Guide lesson the bot follows the lesson board, not the saved opponent mode (`main.ts:779`). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Old OS, ordinary games (not Guide lessons): choosing a different Opponent mode cancels a pending bot reply, in the reply delay and during the search, keeps position and history exactly, and clears the current selection and targets. Choosing the mode that is already checked changes nothing. A stale reply released after the cancel changes nothing. Lessons keep today's behaviour. | [Prop] | e2e (old OS) | — |
| R2 | Old OS: the menu is rebuilt when the state it shows changes, so Game → Undo (and Ctrl/⌘+Z) is enabled exactly when the side Undo button is, and the Opponent, level, style and Flip checks match the game. A rebuild while a menu popup is open closes that popup; focus goes to the CastleSiege window's content. | [Prop] | e2e (old OS) | — |
| R3 | Old OS: the effective reduced-motion setting applies live. With Settings → Motion on System, a change of the browser preference applies at once in both directions (no resize or settings event needed); with On or Off forced in Settings, the browser preference is ignored. Turning reduced motion on during a slide or the victory sequence stops them and shows the end state; turning it off brings slides back on the next move. | [Prop] | e2e (old OS) | — |
| R4 | Old OS: the theme and victory music follow the Music option only; Sound controls sound effects only (including the short win effect). Music off stops either song at once and cancels pending playback; turning Music on after a finished game starts no song; Sound toggles never stop or start a song. The old-OS rules text (`system/usr/share/doc/castlesiege.md`) is corrected to say so. | [Prop] | e2e (old OS) + content | — |
| R5 | No other behaviour changes. Relative to the baseline that includes the owner's 2026-10-24 sheet changes (rules removed from the sheet, short card titles, 150 KiB budget), 008 makes no sheet change: all 003 sheet tests pass. 003 R13 ("old OS unchanged") is superseded only for R1–R4. | [Prop] | e2e | — |

### Acceptance

- **R1.a** Given the old OS, a game against the bot and the visitor's move made: (search) with the bot search held
  through the e2e `__csThink` seam, when Opponent → Hot-seat is chosen, then the search's abort signal fires; (delay)
  with the search done and the reply waiting in the minimum delay, when Opponent → Hot-seat is chosen, then no reply
  is applied. In both, after releasing the stale result and advancing time, the board and history equal the snapshot
  taken before the switch, no piece is selected, and the visitor can move Black.
- **R1.b** Given a selected piece, when the already-checked Opponent mode is chosen, then the selection stays.
- **R1.c** Given a Guide lesson with the bot thinking, when an Opponent item is chosen, then the lesson behaves as
  before this spec (the bot's lesson move is applied once).
- **R2.a** Given the old OS, after a bot reply, then Game → Undo is enabled exactly when the side Undo button is, and
  Ctrl/⌘+Z undoes. After undoing to the start, both are disabled. After Open… of a saved game and after New Game, the
  Opponent, level and style checks match the game.
- **R2.b** Given the visitor plays Black, the bot's first reply held, and the Game menu open, when the reply is
  released, then the open popup closes, focus is in the CastleSiege window, and reopening Game shows Undo enabled.
- **R3.a** Given Motion = System and reduced motion in the browser at start, when the preference is turned off with
  `page.emulateMedia()` and a move is made, then the piece slides. Given reduced motion turned on during a slide or
  the victory sequence (animations paused in the page as they start), then they stop and the end state shows.
- **R3.b** Given Motion = Off forced in Settings and reduced motion in the browser, then pieces slide; given Motion =
  On forced and no reduced motion in the browser, then they do not.
- **R4.a** Given Sound off and Music on, then the theme plays, and a win plays the victory tune; toggling Sound does
  not stop either song.
- **R4.b** Given Music off (Sound on), then no song starts, and a win plays the short win effect only.
- **R4.c** Given the victory tune playing or a song still loading, when Music is turned off, then its abort signal
  fires and it does not resume. Given a finished game, when Music is turned on, then no song starts.
- **R4.d** Given saved Sound/Music values, when CastleSiege restarts on the old OS, then both are restored and the
  theme starts only if Music is on.
- **R5.a** `tests/e2e/castlesiege-sheet.spec.ts`, `castlesiege-sheet-perf.spec.ts` and the old-OS
  `tests/e2e/castlesiege.spec.ts` pass in Chromium, Firefox and WebKit, and `npm run e2e:all` passes. The existing
  old-OS music test (which wins with Music off and expects the victory tune, `castlesiege.spec.ts:391`, `:396`) is
  updated: it turns Music on before that win, and a separate Music-off win check is added; its minimize, restore,
  lesson and close checks stay.

## Approach

- `src/apps/castlesiege/main.ts`: drop `onSheet &&` from the Hot-seat cancel and selection clear, limited to ordinary
  games and to a real mode change (R1); keep the target ownership check as a defensive second layer; drop it from the
  menu rebuild (R2); recompute `.no-motion` from `reducedMotion()` on every motion change (R3); `songs()` returns
  `config.music` on both OSes, and the win branch plays the short effect when Sound is on and the victory tune only
  when Music is on (R4). Keep every guard that is about the sheet itself (config and autosave, history scroll, strict
  import, sheet menu items).
- `src/wm/wm.ts`: when Motion = System, listen to `prefers-reduced-motion` changes and update `html.dataset.motion`
  (and remove the listener when the setting changes) (R3).
- `src/wm/window.ts` (or `src/ui/menu.ts`): `setMenu()` closes this window's open popup before replacing the bar,
  and focus goes to the window's content (R2), as the 002 host already does on the sheet.
- `system/usr/share/doc/castlesiege.md`: Sound = effects, Music = both songs (R4).
- Tests: extend `tests/e2e/castlesiege.spec.ts` (old OS at `/`), reusing the sheet tests' method (real clicks,
  `page.clock`, the e2e-only `__csThink` / `__csMusic` hooks). Run Playwright with `CI=1` so it builds the e2e bundle
  locally and never reuses another server without the hooks.
- **Rejected:** separate old-OS copies of the fixes (duplicate logic); leaving the bugs until 007 deletes the old OS
  (owner asked for the fix).

## Boundaries

- **Always:** keep the sheet's behaviour and tests unchanged (R5 baseline); tests first and seen failing on the old OS;
  respect reduced motion.
- **Ask first:** any old-OS change beyond R1–R4 and the files named in Approach; a new dependency.
- **Never:** deploy or push; touch `art-source/`; change the old OS's config file format.

## Out of scope

- Other sheet-only 003 behaviours on the old OS (history scroll without `scrollIntoView`, keeping the game on a bad
  file, strict import and the 500-move limit, no autosave). The owner can ask for them separately.
- Deleting the old OS (spec 007).

## Open questions

- None. R4's design change was approved with the spec.

## Approval record

2026-10-24 — Owner approved spec 008 as written ("approve 008"), including R4's change to the old OS's music
design (songs follow Music; Sound controls effects only). No gate approved.

## Lead notes

2026-10-24 — T3 review fix: the popup-close rule is limited to CastleSiege (`CLOSE_ON_NEW_MENU` in
`src/wm/window.ts`), so other old-OS apps keep their open menus (R5). Focus after the close goes to CastleSiege's
`.cs` when CastleSiege is the focused window, else stays where the visitor put it. Compact menus (`actionSheet`) are
tracked and closed the same way.
2026-10-24 — Owner-visible: with Sound and Music both on, a win plays the short effect and the victory tune (R4).
The sheet still clears a selection when the same Opponent is chosen (R5 kept the sheet unchanged). The old
`.cs.no-motion` CSS rules are dead (always paired with `[data-motion="reduced"]`); cleanup can go with 007.
