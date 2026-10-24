# 003: CastleSiege live on the sheet

**Status:** Archived 2026-10-24 (spec 007 T7; living docs updated); was Verified (local) 2026-10-23 (T1–T9, branch `spec-003-castlesiege`); Approved · **Owner approval:** 2026-10-22 · **Gates needed:** none
**Related:** specs 001 (sheet, layout table), 002 (app host: `env.DISPLAY === "sheet"`, R6 downloads, R16 motion
flag, R17 sound); OWNER_QUESTIONS 2026-10-22 (CastleSiege first view, app scale 1, sound off); critique
`docs/review/spec-003-critique-codex.md` (13 findings, all accepted); `src/apps/castlesiege/`.

## Why

CastleSiege is the lead project. A visitor must be able to play it at once, in its window, against the real engine
and bot. The owner wants it to look like the current CastleSiege app: the board with the controls and move history at
the side, and a top menu for bot level, bot style and switching to hot-seat play.

## Assumptions

1. Layout classes come from the window width: `wide` at ≥ 440 app px, `roomy` at ≥ 600 (`main.ts:330-336`); cell
   size also depends on height (`main.ts:317`); `roomy` reserves 280 px for the side panel (`styles.css:205`).
   Compact policy (not width) shows Moves/Pieces buttons (`styles.css:274-295`, `main.ts:167`); the sheet uses
   desktop policy (002 R15). [Code]
2. Modes are `bot` and `hotseat` (`session.ts:16`); defaults are level `easy`, style `0` (Balanced)
   (`session.ts:40-41`). The menu has Game, Options and Help (`main.ts:1097-1195`). [Code]
3. The bot already yields in about 12 ms slices (`bot.ts:59-110`, tested in `tests/unit/castlesiege/bot.test.ts:68`);
   deeper searches still have synchronous recursion (`ai/alphabeta.ts:362`). [Code] **Unverified:** the longest task
   per level in a browser.
4. How to play and Rules open the Guide lesson or Reader today (`main.ts:1073-1079`, `:1188`); neither is on the
   sheet. The rules text is `system/usr/share/doc/castlesiege.md`. [Code]
5. Every render rebuilds the move history and calls `scrollIntoView` on its last row (`main.ts:435-453`). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Each start on the sheet: a new game against the bot, visitor White, level Easy, style Balanced, Music off. The sheet turns off autosave of the game and of `config.from`; explicit Save/Open still work. | [Prop] | e2e | — |
| R2 | On every screen the window shows the wide layout: board with all 63 cells, side panel with the moves list, piece reference (six pieces) and controls, no clipping, at `--u` = 1 px and 16 px text. T1 measures the demo area and menu row and writes the outer size into the 001 layout table (inside the ~620 px width). | [Prop] | e2e | — |
| R3 | Phones use the same window; 001's phone fit (R15: visible width minus the 16 px gutters, divided by the window width) opens it at about 58 % on a 390 px screen. (Amended 2026-10-23, advisor; was "about 63 %".) | [Prop] | e2e (mobile) | — |
| R4 | Menu row: Game (New Game…, Undo, Flip board, Save…, Open…), Options (Opponent: Bot / Hot-seat, Bot level, Bot style, Music), Help (How to play, Rules, Play online ↗, About). Exit, lesson and Guide items are removed. How to play and Rules open a panel inside the window with the text of `castlesiege.md`. | [Prop] | e2e | — |
| R5 | Changing Opponent keeps the position and history. Switching to Hot-seat cancels a pending bot reply. Level and style changes apply to the next bot search. | [Prop] | e2e | — |
| R6 | Menu items, shortcuts and side controls always agree with the game state (for example Undo is enabled in the menu exactly when the side Undo button is). | [Prop] | e2e | — |
| R7 | No sound effects. Theme and victory music only with Music on. Music off stops either song at once and cancels pending playback; turning Music on after a finished game does not start victory music. | [Prop] | e2e | — |
| R8 | While the bot thinks, no main-thread task exceeds 200 ms at Easy and Normal (Chromium, Playwright CPU throttling ×4, start position and two fixed mid-game positions), and a window can be thrown during the search. | [Prop] | e2e (trace) | — |
| R9 | Reduced motion: no piece slide, victory drop or title flash, including when the preference changes during play or victory. | [Prop] | e2e | — |
| R10 | Save… downloads a `.siege` file; Open… of that file restores mode, side, level, style, history, side to move and position. An invalid file shows an error and keeps the current game. | [Prop] | e2e | — |
| R11 | History updates scroll only the move list; they never change the sheet view or keyboard focus. | [Prop] | e2e | — |
| R12 | "Play online" opens https://castlesiege.fly.dev in a new tab. The sheet makes no request to that host by itself. | [Prop] | e2e | — |
| R13 | All sheet-only behaviour is gated on `os.env.DISPLAY === "sheet"`. The old OS CastleSiege is unchanged, with and without lesson content. | [Prop] | e2e | — |

### Acceptance

- **R1.a** Given `/next` at 1440 × 900, when CastleSiege is in view, then the start position shows, the status says
  White to move against the bot (Easy), and clicking a white piece shows its moves.
- **R1.b** (Amended 2026-10-23, advisor.) Given a move made on the sheet, then the memory fs has no autosave file for
  CastleSiege and browser storage is empty. When the page is reloaded in the same visit and CastleSiege is in view
  again, then it is a new game with the defaults of R1 (bot, visitor White, Easy, Balanced, Music off).
- **R2.a** Given 1440 × 900 and 390 × 844, then the root has class `wide`, 63 cells and 6 reference entries are
  visible, no element of the window has hidden overflow content, and computed text size is 16 px.
- **R4.a** Given the menu row, then the items of R4 are present in that order and no Exit, lesson or Guide items
  exist. Given Help → Rules, then a panel in the window shows the rules' first heading.
- **R5.a** Given 3 moves played against the bot, when Opponent → Hot-seat is chosen during the bot's search, then the
  bot does not move, the 3 moves remain, and Black can be moved by the visitor.
- **R6.a** Given a bot reply, then Game → Undo and ⌘/Ctrl+Z work; after undoing to the start, both are disabled.
- **R7.a** Given Music off, when a game is won, then the CastleSiege music player never starts a track (test hook on
  its `Music` object). Given Music on, then victory music starts; when Music is turned off, then it stops.
- **R8.a** A Playwright Chromium trace during 3 bot replies (×4 CPU throttling) shows no task over 200 ms, and a
  window drag during the search moves the window. A test that injects a 250 ms task makes the check fail.
- **R9.a** Given reduced motion, when a piece moves and when a game is won, then the end state shows at the next frame
  with no running CSS animation; when the preference turns off mid-game, then the next move animates.
- **R10.a** Given a hot-seat game at Normal with 4 moves, when it is saved, a new default game started, and the
  downloaded bytes opened, then mode, level, history and position match. A corrupt file shows an error and the
  current game stays.
- **R11.a** Given the view panned to Quick tools while the bot thinks, when the bot replies, then the sheet view and
  focus do not change.
- **R12.a** Given Help → Play online, then a new page opens to `https://castlesiege.fly.dev`, and the sheet made no
  request to that host.
- **R13.a** The existing `tests/e2e/castlesiege.spec.ts` passes on `/`, and an old-OS check with the lesson file
  removed still opens Reader for How to play.

## Approach

- Register `castlesiege` in the 002 host. Resources: `/usr/share/music/castlesiege-{theme,victory}.trk` and
  `/usr/share/doc/castlesiege.md`.
- App changes gated on `env.DISPLAY === "sheet"`: remove Exit/lesson/Guide items; How to play and Rules → a text
  panel (reuse `marked`, already a dependency); skip autosave and restore; defaults on start; music rules of R7;
  `scrollIntoView` → scroll the list element only; rebuild the menu on state changes (R6; this fixes the old OS too
  only if the owner agrees, else gate it).
- Bot: measure first (T1). If R8 fails, propose a Worker or deeper slicing as a spec amendment.
- **Rejected:** a separate sheet-only build; a bot-vs-bot attract mode (owner chose a ready game).

## Boundaries

- **Always:** keep the old OS CastleSiege working at `/`.
- **Ask first:** rule or bot-strength changes; a Worker; fixing R6 in the old OS too.
- **Never:** connect to castlesiege.fly.dev from the sheet; save games in browser storage.

## Out of scope

- Online play inside the window; lessons and the Guide.

## Open questions

- None.

## Approval record

2026-10-22 — Owner approved this spec as written ("Approve all", together with 001 Amendment 1 and specs 002–007),
including the proposals named in it. No gate is approved by this.

## Advisor decisions (overnight run)

2026-10-23 — Decided by the Fable advisor for the owner (T2/T3):
- R3 wording: "about 63 %" → "about 58 %". 001's fit is (390 − 2 × 16) / 620 = 0.577 (observed 57.7 %); 63 % was
  390/620 without gutters. Behaviour unchanged.
- R4 vs R1.b: R4 stays (no Exit on the sheet); R1.b's "started again" = page reload (amended above). CastleSiege has
  no close path on the sheet by design (R4, 002 T7). If the owner later adds a sheet close button, R1 still holds
  (defaults applied in `main()` at every start); cover it then with a `win.close()` → activate test.
Rejected: a Close item in CastleSiege's menu, a close button on every window (UI the owner did not ask for).
Owner to confirm.
2026-10-23 — Lead decision (T4, budget): `castlesiege.md` is rendered with `marked` at build time (host resource
step, Reader's `renderMarkdown`, raw HTML dropped) and shipped as `/usr/share/doc/castlesiege.html`; no `marked`
code in `/next`. Meets R4 "rendered by marked"; a runtime import (~14 KB gzip, estimated) would break 001 R22.
2026-10-23 — Owner item (T4): `system/usr/share/doc/castlesiege.md` describes old-OS behaviour (Options > Sound,
autosave to `~/.config`, maximized window, phone Pieces button, Tracker files) that is false on the sheet; the sheet
panel shows it. Needs a content edit or a sheet-only copy (owner's choice).
2026-10-23 — T9 (Codex #1/#2): on the sheet an imported `.siege` is validated strictly (mode, human, level, style,
actions) and limited to 500 moves before it replaces the game (`MAX_IMPORT_ACTIONS`; 500 moves open in a 65.8 ms
longest task at CPU ×4, 1,000 would reach 194 ms). The old OS keeps its lenient parse. Owner item: R8 measures Easy
and Normal; Hard is reachable in the sheet menu and was not traced.
2026-10-24 — **Owner decision:** the rules are removed from the sheet for now (they described the old OS; to be
revised later). R4's Help on the sheet is now Play online ↗, About; How to play, Rules, the rules panel and the
build-time rules HTML are gone. R4.a's test follows. Old-OS Help is unchanged.
