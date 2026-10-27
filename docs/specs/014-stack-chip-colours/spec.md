# 014: Coloured stack chips

**Status:** Approved 2026-10-26 (was Critiqued) · **Owner approval:** 2026-10-26 · **Gates needed:**
none for the build; G-deploy to ship
**Related:** 001 (R18 contrast, R22 budget), 013 (Read panel title block, `readPanel` in `scripts/sheet-content.ts`),
011 and 012 (the live builds' chip sets), mock v0.7 (`docs/mockups/README.md`), critique
[`docs/review/spec-014-critique-codex.md`](../../review/spec-014-critique-codex.md) (6 findings, all accepted).

## Why

Each project window shows its stack as chips ("Python", "asyncio", "Anthropic API" …). Today every chip has the
same `--chip` background (`src/sheet/sheet.css:319-323`). The owner wants each chip coloured by its technology, as
GitHub colours languages, so a visitor sees a project's stack at a glance. Owner request 2026-10-26, relayed by the
orchestrator.

## Owner answers 2026-10-26

| Topic | Answer |
|---|---|
| Style | A tinted chip background: the whole chip takes a tint of the colour, a darker variant in dark mode, and text that meets 001 R18 (4.5:1) in both themes, also after a live theme change. |
| Languages | GitHub Linguist's exact colours (`languages.yml`, MIT). Record the source version, commit and licence. |
| Other tools | Each tool's own brand colour, from a fixed table in the repo, with a source per entry. asyncio is part of Python: the spec proposes. |

**Round 2** (closes Q1 to Q6):

| Q | Answer |
|---|---|
| Q1 No brand colour | The parent's colour: WebSocket, Canvas, Web Workers → JavaScript (Linguist `#f1e05a`); AppKit → Swift. GDELT has no parent: neutral. |
| Q2 Combined chips | Split "React Native / Expo" and "Fly.io / Docker" into separate chips (a content-only edit, part of the 014 tasks). |
| Q3 Unknown name | The build fails. |
| Q4 Mock | A new mock v0.8 with coloured chips: copy v0.7, change only the chips, name it in `docs/mockups/README.md`; compare-vs-mock then uses v0.8. |
| Q5 Anthropic API | Anthropic's near-black `#141413` (strict own brand). |
| Q6 Requests, Pillow | Python's colour, as asyncio (owner's answer to Q1). |

## Assumptions

1. Chips render in two places, both from `scripts/sheet-content.ts`: the window's about block (`:377`) and 013's
   Read panel title block (`:346`). Both use `<span class="chip">`. [Code]
2. The site follows `prefers-color-scheme` only, with tokens on `:root` (`src/sheet/sheet.css:40-82`). A CSS-only
   colour change follows a live theme change with no JavaScript. [Code]
3. Linguist v9.7.0 is the latest release on 2026-10-26: commit `e0c78d62c42abae6122235d8e68a7aa43eef89da`
   (2026-08-26), `lib/linguist/languages.yml`, MIT, "Copyright (c) 2017 GitHub, Inc.". **Observed** (`gh api`,
   2026-10-26).
4. Brand colours come from each tool's own logo, CSS or brand page where it was read, else from Simple Icons
   (`data/simple-icons.json`, v16.36.0, commit `90646e4bf7f3b89df6c37e65baf3e7bc759a517c`, CC0), which names its own
   source per icon. **Observed** by a researcher, 2026-10-26. Rows from Simple Icons only are marked "SI".
5. Several brands are near-black (Ollama `#000000`, Anthropic `#141413`, Expo `#1C2024`, Fly.io `#24175B`, pandas
   `#150458`) or very light (DuckDB `#FFF000`, React Native `#61DAFB`). A simple alpha tint makes the black ones grey
   and the light ones unreadable with light text. **Derived.** So the tint is built in OKLCH (R3).

## Stack names in use

From `content/projects/*.md` (`grep -h '^stack:'`, 2026-10-26) and the live chip sets that 013's outlines name for
011 and 012 (owner N7: the live build's stack; final sets come with 013 T15, T16):

| Where | Chips |
|---|---|
| castlesiege | TypeScript · React Native / Expo · Node.js · WebSocket · PostgreSQL · Web Workers · Fly.io / Docker (split by R10 into React Native · Expo and Fly.io · Docker) |
| castlewars | Aseprite · TypeScript · Canvas |
| pentimento | Swift 6 · AppKit · Metal · TypeScript · Claude Agent SDK |
| crawler (today) | Python · asyncio · Anthropic API · Ollama · scikit-learn · Pandas · Matplotlib |
| insider (today) | Python · PySpark · Spark SQL · Spark MLlib · BigQuery · GraphQL |
| whole-plant-ice-cream (not on the sheet) | Python · HTML · CSS · Playwright · Chromium |
| crawler live (011, candidate) | TypeScript · Cloudflare Workers · Workers AI · Turnstile · Ollama (fflate is a library, not proposed) |
| insider live (012, candidate) | Python · DuckDB · Requests · Pillow · Polymarket Data API · GDELT · Cloudflare Workers · D1 |

## The colour table (proposed content of `content/stack-colours.json`)

**Languages** (Linguist v9.7.0, `languages.yml`, the `color` of the named language):

| Chip | Linguist language | Colour |
|---|---|---|
| TypeScript | TypeScript | `#3178c6` |
| Python | Python | `#3572A5` |
| Swift 6 | Swift | `#F05138` |
| Metal | Metal | `#8f14e9` |
| HTML | HTML | `#e34c26` |
| CSS | CSS | `#663399` |
| GraphQL | GraphQL | `#e10098` |
| (parent only) | JavaScript | `#f1e05a` |

**Same as a language:** asyncio → Python `#3572A5`. Reason: asyncio is part of Python's standard library, and GitHub
would count its code as Python; a neutral chip would say "not related", which is wrong. (Owner asked the spec to
propose.)

**Parent colour** (owner, round 2): Requests and Pillow → Python (no brand colour found: Requests has no brand page,
Pillow's logo is white and grey only); WebSocket, Canvas, Web Workers (web platform APIs) → JavaScript `#f1e05a`;
AppKit (Apple has no per-framework colour) → Swift `#F05138`. Each is a `same` entry with this reason.

**Neutral** (owner, round 2): GDELT (its site uses greys only; no parent). It keeps today's `--chip`.

**Brands:**

| Chip | Colour | Source | Note |
|---|---|---|---|
| Aseprite | `#7D929E` | aseprite.org site CSS (`/assets/css/aseprite.css?v=40`); SI agrees | |
| Claude Agent SDK | `#D97757` | `claude.ai/favicon.svg` path fill; SI `Claude` agrees | |
| Anthropic API | `#141413` | `https://www.anthropic.com` `<meta name="theme-color">` | owner Q5: strict own brand |
| React Native | `#61DAFB` | `reactnative.dev/img/header_logo.svg` fill | own chip after the split (Q2) |
| Expo | `#1C2024` | SI (expo.dev/brand) | own chip after the split |
| Node.js | `#5FA04E` | SI (nodejs.org/en/about/branding) | |
| PostgreSQL | `#4169E1` | SI (wiki.postgresql.org/wiki/Logo) | |
| Fly.io | `#24175B` | SI (fly.io/docs/about/brand) | own chip after the split |
| Docker | `#2496ED` | SI (docker.com media resources) | own chip after the split |
| Ollama | `#000000` | SI (ollama/ollama issue 2152) | |
| scikit-learn | `#F7931E` | SI (project logo SVG, commit `c5ef2e9`) | |
| Pandas | `#150458` | SI (pandas.pydata.org/about/citing.html) | |
| Matplotlib | `#11557C` | matplotlib `doc/_static/logo2.svg` fill | |
| Playwright | `#2EAD33` | playwright.dev logo SVG (green of three) | multi-colour logo: one picked |
| Chromium | `#1A73E8` | chromium `product_logo.svg` fill | |
| PySpark, Spark SQL, Spark MLlib | `#E25A1C` | SI `Apache Spark` (apache.org/logos) | no colour of their own |
| BigQuery | `#669DF6` | SI (cloud.google.com/icons) | |
| Cloudflare Workers, Workers AI, Turnstile, D1 | `#F38020` | SI `Cloudflare Workers` (cloudflare.com/logo) | no distinct colour per product |
| DuckDB | `#FFF000` | SI (duckdb.org) | |
| Polymarket Data API | `#2E5CFF` | polymarket.com/brand logo tile | |



## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | One data file, `content/stack-colours.json`, holds every chip's colour. Each entry is keyed by the exact chip text and is one of: `{ "colour": "#rrggbb", "source": "<full URL>", "revision": "<commit, version or date read>", "detail": "<how the value was taken, e.g. the SVG path fill>" }`, `{ "same": "<chip with a colour>", "reason": "…" }`, or `{ "neutral": true, "reason": "…" }`. Simple Icons rows name both Simple Icons (version, commit) and the brand source it cites. A header records the Linguist release, commit, file and licence, the Simple Icons version, commit and licence (CC0), and the date read. The Linguist licence text at that commit is kept beside it as `content/licences/linguist-LICENSE.txt`. | [Prop] | unit | — |
| R2 | Build check: every chip of every project the sheet shows has an entry. A `same` points in one hop to an entry with a `colour` (not to itself, another `same`, a neutral or a missing name). Colours are 6-digit hex. An unknown chip fails the build and names the project file and the chip (proposal; Q3). | [Prop] | unit | — |
| R3 | Tint, at build time, in OKLCH (Björn Ottosson's sRGB↔OKLab matrices, CSS Color 4): from the brand colour take hue H and chroma C. Light background: L = 0.93, chroma min(C, 0.07). Dark background: L = 0.36, chroma min(C, 0.09). If that colour is outside sRGB, reduce chroma only (binary search, 30 steps), keeping L and H, until it is inside. Convert to sRGB, round each channel to the nearest byte, and write `#rrggbb`. Hue and contrast are measured on that final hex. A brand with C < 0.02 (black, greys) has no hue to keep. The chip text stays the theme's `--ink`. The build fails if any background gives the text under 4.5:1 (no automatic adjustment: with today's tokens the lowest is 11.0:1 light and 9.4:1 dark, derived 2026-10-26). A neutral chip keeps today's `--chip`. | [Prop] | unit | — |
| R4 | Render: each coloured chip gets `style="--chip-l:#…;--chip-d:#…"` from the build; `.chip` uses `var(--chip-l, var(--chip))`, and under `prefers-color-scheme: dark` `var(--chip-d, var(--chip))`. Same markup in the window's about block and the Read panel title block (one function). No JavaScript; a live theme change applies at once (CSS). | [Prop] | unit + e2e | — |
| R5 | Tests. Unit: (a) the Linguist colours in the data file equal values written in the test from `languages.yml` at the pinned commit, not read from the table; (b) the R3 outputs for fixed inputs (below); (c) every chip × theme meets 4.5:1 with the `--ink` read from `src/sheet/sheet.css`; (d) the built page has the expected chip count and labels per window, two different technologies have different backgrounds, the alias has its target's values, and a neutral chip has none. e2e: in the window and in the Read panel (made visible), and on each `/p/<id>/` with JavaScript off, every chip's computed background equals its expected value and its text meets 4.5:1, in light, then dark, then light again without a reload (polling after `emulateMedia`). | [Prop] | unit + e2e | — |
| R6 | Colour is decoration only: the chip text is unchanged and stays the only label. No information is given by colour alone. | [Prop] | review | — |
| R7 | No network and no dependency: the colours are copied by hand into the data file with their sources; nothing fetches Linguist or Simple Icons at build or in the page. The OKLCH maths is about 40 lines in `scripts/`. 001 R22 budgets hold (only inline custom properties and two CSS lines are added). | [Prop] | build | — |
| R8 | The colour of a chip is the same wherever the same text appears (both places, every window). | [Prop] | unit | — |
| R10 | Content (owner Q2): `content/projects/castlesiege.md` lists "React Native", "Expo", "Fly.io" and "Docker" as four chips instead of the two combined ones. | [Prop] | unit | — |
| R11 | Mock (owner Q4): `docs/mockups/rargu-os-v0.8.html` is a copy of v0.7 with only the stack chips coloured by this spec's values (the split chips included); `docs/mockups/README.md` names it as the current mock with its SHA-256; v0.7 stays as it is. compare-vs-mock for 014 and later specs uses v0.8. | [Prop] | review + compare-vs-mock | — |
| R9 | Print and forced colours: in `@media print` a chip has no background, black text and a 1 px black border, so a page printed from the dark theme with backgrounds off stays readable. In `forced-colors: active` the browser's system colours replace the tints (no override); the label stays readable. | [Prop] | e2e | — |

### Acceptance

- **R1.a** Given the data file, then its header names Linguist `v9.7.0`, commit `e0c78d6…`, "MIT" and the copyright
  line, and Simple Icons `16.36.0`, commit `90646e4…`, "CC0".
- **R2.a** Given a project with the chip "Pythn", then `npm run build` fails and names the file and "Pythn".
- **R2.b** Given `{ "same": "Nothing" }`, then the build fails.
- **R2.c** Given `{ "same": "asyncio" }` on a second chip, or a `same` to itself, then the build fails.
- **R3.a** Given these inputs, then the outputs are exactly (light / dark): Python `#3572A5` → `#d5ebff` / `#054069`;
  Metal `#8f14e9` → `#ede2ff` / `#473064`; Ollama `#000000` → `#e8e8e8` / `#3d3d3d`; DuckDB `#FFF000` → `#eeebb5` /
  `#433f00`. For every brand with C ≥ 0.02, the hue of both outputs is within 2° of the brand's (derived maximum
  1.4°, 2026-10-26).
- **R3.b** Given a test `--ink` close to the tints (for example `#c0c0c0` in light), then the build fails and names the
  chip.
- **R4.a** Given the crawler window in light, then the "Python" chip's background is its `--chip-l` value; after a
  live change to dark, its `--chip-d` value, with no reload.
- **R5.a** Given every chip of every project (unit), and every chip on the page, the Read panel and `/p/<id>/` without
  JavaScript (e2e), in light, dark and light again, then each background equals its expected value and text contrast
  is ≥ 4.5:1.
- **R5.b** Given the castlesiege window, then it has 9 chips with the labels of its content file (after R10), and
  "TypeScript" and "Node.js" have different backgrounds.
- **R10.a** Given the built page, then no chip text contains " / ".
- **R11.a** Given `docs/mockups/README.md`, then v0.8 is current with a hash that matches the file, and a diff of
  v0.7 and v0.8 touches only chip markup or chip styles.
- **R8.a** Given "TypeScript" in castlesiege, castlewars and pentimento, then the three chips have the same values.
- **R9.a** Given print emulation in the dark theme, then each chip has no background, black text and a border.

## Approach

- Content edit (R10): split the two combined chips in `content/projects/castlesiege.md`. Mock (R11): copy
  `docs/mockups/rargu-os-v0.7.html` to v0.8 (or rebuild it from a copied source folder, as v0.7 was), colour the
  chips, update the README table.
- `content/stack-colours.json` and `content/licences/linguist-LICENSE.txt` (R1). `scripts/stack-colours.ts`: load,
  check (R2), OKLCH convert, gamut map and tint (R3),
  return `{ light, dark }` per chip text. `scripts/sheet-content.ts`: one `chip(name)` function used in both places.
  `src/sheet/sheet.css`: the `.chip` rule (R4). Tests: `tests/unit/stack-colours.test.ts`, an e2e in
  `tests/e2e/sheet-a11y.spec.ts` or a new `stack-chips.spec.ts`.
- **Rejected:** alpha tint over the page (black brands become grey mud and light brands fail with light text);
  a coloured dot or border only (the owner chose a tinted background); fetching Linguist at build (network, and a
  colour could change without review); a CSS `color-mix()` at run time (contrast could not be checked at build).

## Boundaries

- **Always:** a source per colour; 4.5:1 for every chip in both themes; the Linguist licence note in the data file.
- **Ask first:** a colour without a source; a new chip name (it needs an entry); changing the approved mock.
- **Never:** fetch colours at build or in the page; put a brand logo on the site (colours only).

## Out of scope

- Other chips on the site (the Read panel's section nav uses `--chip` and stays as it is).
- Brand logos or icons.

## Open questions

- None. Q1 to Q6 closed by the owner, round 2 (table above).

## Approval record

2026-10-26 — **Owner approved this spec** ("Approve, build it"), relayed by the orchestrator, including the round 2
answers. No gate is approved by this (G-deploy and G-push stay ask-first).

2026-10-26 — Owner answers Q1 to Q6 given through the orchestrator (round 2 table).
