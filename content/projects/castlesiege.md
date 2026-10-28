---
title: CastleSiege
short: CastleSiege
year: 2026
stack: [TypeScript, React Native, Expo, Node.js, WebSocket, PostgreSQL, Web Workers, Fly.io, Docker]
links: [https://castlesiege.fly.dev]
app: castlesiege
status: playable
summary: Two-player strategy on a 7×9 board with mismatched move and attack ranges. Play online or against a browser bot.
---

# CastleSiege

<!-- TODO(content): gameplay images supplied by Rodrigo (PNG stills of a mid-game board, chat open if available; GIFs allowed per SPEC §11), saved as content/images/castlesiege-*.png|gif -->

## What it is

A two-player turn-based strategy game on a 7×9 board. Each side has 13 pieces: a King, Walls, Swords, Hammers, Spears, and Bows. On your turn you either move or attack, never both. Melee pieces take the square of what they capture, while ranged pieces shoot from where they stand. Only Hammers can break Walls. There's no check and there are no draws. You win by capturing the King, destroying every enemy Wall, leaving the enemy with nothing that can attack, or leaving them with no legal move.

You can play it at [castlesiege.fly.dev](https://castlesiege.fly.dev), with ranked matchmaking, or practice against a bot that runs in your browser, or right here, from the Projects group.

## Why I built it

The first version was a Unity game I made for a 7-day game jam whose theme was "seemingly simple, but with surprising depth." It has fewer pieces than chess, but the depth comes from how they differ. Movement and attack ranges don't match. Some pieces are ranged, some are melee, some are both. Some can deal with Walls and most can't.

That version only ran on one device. I rebuilt it so other people could actually play it against each other, through matchmaking.

## What was hard

- **Stalling.** Strong play kept collapsing into fortresses where neither side could make progress, and the rules have no draw. The fix was a repetition ban: you can't recreate a position too many times. That made the engine depend on game history for the first time, so every part that assumed "the board is the whole state" (search, hashing, replays, the server store) had to change.
- **Balance.** In self-play, a dedicated defensive bot beat a Monte Carlo bot 100% of the time. When I tried to tune piece values automatically from self-play data, the Sword came out with a negative value. That was an honest dead end, and it changed how I measure balance.
- **Bugs the tests couldn't see.** The server tests ran against an in-memory store, and that store hid race conditions. Rerunning the suite against a fresh PostgreSQL database turned up 11 real concurrency bugs in matchmaking, challenges, and game flow, each now pinned by a test that fails without the fix.
- **One machine.** The server's authority lives on a single machine. Moving that authority into PostgreSQL, so it can scale past one box, is the rewrite in progress now.
