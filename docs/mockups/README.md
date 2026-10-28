# Mockups

The approved mock is the layout baseline for UI specs (`compare-vs-mock` skill). Never edit an approved file. Make a
new versioned copy and record it here.

## Current

| File | SHA-256 | Status | Notes |
|---|---|---|---|
| `rargu-os-v0.8.html` | `6dfac7b9bb76d207295842fa4502b47dd07f41c0e2e47fd9b8edee9c5dd0059b` | **Approved** 2026-10-26 (owner; spec 014 R11, Q4). v0.7 with coloured stack chips only: each chip's `--chip-l` / `--chip-d` from `content/stack-colours.json` and the 014 tint, the `.chip` rule for both dark selectors, and "React Native / Expo" split into two chips. Nothing else changed: window contents, sizes and the title block (it still says v0.7) are as in v0.7 | Not published as an artifact. The current baseline |
| `rargu-os-v0.7.html` | `660e1b6137795417358dc4bbb77a48008fcb7165ccf8a54ea25c82c854c7cdea` | Superseded by v0.8 (2026-10-26). **Approved** 2026-10-24 (owner; spec 004 T1). v0.6 + the measured Quick tools rectangles (Paint 1920,760 434×350; Music 2400,700 556×348; Notes 1920,1150 424×364) and CastleSiege h 658 (003 T1). Window contents unchanged (stand-ins); title block says v0.7. Pentimento, crawler and insider keep their v0.6 heights (542, 496, 511; the 005/006 table changes are not in the mock) | Not published as an artifact |
| `rargu-os-v0.6.html` | `dc21ad5c7d0513aac53ed44a2522ee91b144c7edc89367617bd545021860d3f6` | Superseded by v0.7 (2026-10-24). v0.5 + contrast fixes (owner ruling 2026-10-22, Codex 001 #16): dark-theme title text `#111a33`, status badges ink text with hued border, light focus ring navy | Not published as an artifact |
| `rargu-os-v0.5.html` | `ed08c7019b58b5c1b248e623aa98d49d662a0b2df59503b530ea8e3f3fcbfd25` | Superseded. Owner-reviewed 2026-10-22 (direction approved) | RArgu OS blueprint sheet. Published as a private artifact: https://claude.ai/artifact/1S2rACbQckb78rDqGZp4D7 (version 5) |

## Hash change 2026-10-27 (spec 015)

The owner removed the public email from the repo. In every mock source and file, the address text is now
`email@example.invalid`. Nothing else changed. The hashes above are the new ones. The rebuild commands below were run
and reproduce them. The old hashes are in git history.

## How to rebuild

`python3 -I docs/mockups/rargu-os-src/build.py`. It joins `part1.html` (markup and CSS), `part2.js` (sheet, zoom,
window physics, minimap), `reused.js` (the window contents) and `part3.js` (start-up), and inlines the fonts,
sprites, piece masks and icons from `public/` and `src/apps/`. With no argument (or `rargu-os-v0.8.html`) the sources
build v0.8 and the output must match the v0.8 hash. `python3 -I docs/mockups/rargu-os-src-v0.7/build.py` rebuilds
v0.7 from its frozen copy (spec 014 T5) and `python3 -I docs/mockups/rargu-os-src-v0.6/build.py` rebuilds v0.6
(spec 004 T1); each output must match its hash. v0.8 changes only the stack chips. A later version copies the sources
the same way first, then passes its own name. v0.7 changes only the Quick tools rectangles and the CastleSiege
height. v0.5 is kept as a file only.

## What the mock fakes

These parts are stand-ins. The build replaces them.

- CastleSiege board: pieces step one square, Black moves at random. The build uses the real engine and bot.
- Focused Crawler and Insider Trading: invented, simulated data. Owner decision 2026-10-22: dummy data for now.
- Pentimento: a scripted sketch. Nothing is built.
- Save .png / Save .txt: show a message, because the artifact viewer blocks downloads. The build downloads files.

## Known mock defects (fix in the build, do not copy)

- Quick tools: the label sits beside the icon. It should sit under the icon.
- At 390 px width a window (600–680 px) is wider than the screen. The visitor must pan to read it.
- Observed by a Playwright render on 2026-10-22 (1440×900 light, 390×844 dark), Chromium only.
