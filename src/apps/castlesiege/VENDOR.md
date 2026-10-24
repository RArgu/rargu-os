# Vendored CastleSiege code

Source: Rodrigo Arguello's CastleSiege repository (`~/Documents/Projects/CastleSiege`), commit
`000463f` ("Docs audit sweep: fix stale references"). Every file was taken with
`git show 000463f:<path>`, never from the working tree (which had uncommitted changes).

## Files

| Here                         | Upstream                     | Notes                                                            |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `engine/core.ts`             | `engine/core.ts`             | rules: setup, legal actions, validation, apply                   |
| `engine/types.ts`            | `engine/types.ts`            |                                                                  |
| `engine/position.ts`         | `engine/position.ts`         | repetition key                                                   |
| `engine/index.ts`            | `engine/index.ts`            | barrel                                                           |
| `engine/rulesets/default.ts` | `engine/rulesets/default.ts` | `default@1.1.0`                                                  |
| `ai/alphabeta.ts`            | `ai/alphabeta.ts`            | see "Local changes"                                              |
| `ai/evaluate.ts`             | `ai/evaluate.ts`             |                                                                  |
| `ai/aggression.ts`           | `ai/aggression.ts`           | bot styles                                                       |
| `ai/rng.ts`                  | `ai/rng.ts`                  |                                                                  |
| `ai/zobrist.ts`              | `ai/zobrist.ts`              |                                                                  |
| `ai/types.ts`                | `ai/types.ts`                | the whole file; it is types only and costs nothing in the bundle |

`ai/index.ts` is never imported (its barrel pulls in the balance lab).

Tests, in `tests/unit/castlesiege/`: every `engine/*.test.ts` except `engine/boundary/` (12 files) and
`ai/{alphabeta,evaluate,zobrist,rng,aggression}.test.ts`.

Sprites: `client/assets/game/_src/{white,black}/*.png` (6 shapes, 16x16, one colour each; white and
black are the same masks) are re-encoded as bitmap strings in `art.ts`. Drawn by Rodrigo in
Aseprite. The `ui/` plates are not used (the app draws its own move dots and attack brackets).

Dropped: the React Native client, server, transport, ratings, names, worker search, sounds and fonts.

## Local changes

1. All files were reformatted with this repo's Prettier settings. No logic was edited by that.
2. The relative imports keep their `.js` suffixes; Vite, Vitest and `tsc` resolve them to `.ts`.
3. Tests: import paths rewritten to point at `src/apps/castlesiege/`. From `ai/alphabeta.test.ts`
   the "STRENGTH GATE — alpha-beta crushes random" case was removed, with its `randomAgent` and
   `runLadder` imports, because it needs the self-play lab (`ai/selfplay.ts`, `ai/random.ts`),
   which is not vendored.
4. `ai/alphabeta.ts`, for the main-thread bot (`bot.ts`): the root search moved into a generator
   (`rootSearcher`) that yields after every root move, and the root's children are searched by
   `negamaxSliced`, a line-for-line generator copy of `negamax` that yields after every reply. The
   window, move order, transposition table and node counting are unchanged, so the value and move
   are the same; the upstream tests still pass, and `tests/unit/castlesiege/bot.test.ts` checks the
   sliced driver against the synchronous agent at depth 2 (20 positions) and 3 (8 positions).
   `alphaBetaAgent` keeps its signature and runs the generator to completion; `alphaBetaSliced` is
   new and awaits a `pause()` between steps. Measured in Node on this Mac with 12 ms slices: root
   moves alone gave slices up to 87 ms, so the one-ply-deeper split was added; slices are now at
   most about 20 ms.
