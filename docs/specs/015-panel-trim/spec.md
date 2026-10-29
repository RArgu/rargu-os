# 015: Panel trim, hidden email, short window copy, yellow Notes

**Status:** Approved (2026-10-27) · **Owner approval:** 2026-10-27, answers below · **Gates needed:** none (G-deploy, G-push stay with the owner)
**Related:** spec 001 (the card, R11), 013 (project windows), 014 (chips); approved mock `docs/mockups/rargu-os-v0.8.html`;
`docs/OWNER_QUESTIONS.md:25` (card row); base: branch `integration` at `2ebb4d8`.

## Why

The side panel is large and carries text the owner no longer wants (hints, name, blurb, address). The project windows
have long descriptions (3 lines). The Notes window looks like the other windows. The owner asked for seven changes. They
touch the same files (`scripts/sheet-content.ts`, `src/sheet/sheet.css`, `index.html`), so one spec covers all seven.

## Claim labels

**observed** = I ran a command or read the file. **derived** = follows from observed facts. **inferred** = a guess,
with reasons. **Unverified** = not checked. Baseline numbers are from `integration` built with `npm run build`, then
`vite preview` and Playwright (Chromium), 2026-10-27.

## Assumptions

1. The panel is `.rail` (`src/sheet/sheet.css:407`), made by `card()` (`scripts/sheet-content.ts:215`). **observed**
2. "Half in width and height" applies to the desktop panel (viewport over 760 px). The phone bar (`max-width: 760px`,
   `sheet.css:615`) stays a bar. Its opened content gets the same text changes. **inferred**; NEEDS OWNER Q1.
3. "On this sheet" means the heading `<h2>On this sheet</h2>` (`sheet-content.ts:244`). The project buttons under it stay,
   without the heading. **inferred**
4. "Name" means the bold name line in the panel (`sheet-content.ts:236`). **observed**
5. The `Copy` button goes away with the visible address. The owner can ask for a click-only Copy later. **inferred**
6. The approved mock stays v0.8. `compare-vs-mock` lists each difference with its reason. No v0.9 mock unless the owner
   asks. **inferred**

## Baseline (observed)

| Viewport | Panel width x height (CSS px) | Panel scrolls? |
|---|---|---|
| 1440x900 | 280 x 791 | no |
| 1024x700 | 280 x 668 | yes (capped by viewport) |
| 800x600 | 280 x 568 | yes |
| 390x844 (phone) | 358 x 54 (folded bar) | no |

Command: Playwright script reading `.rail` `getBoundingClientRect()` on `vite preview` of the `integration` build.

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Remove the `On this sheet` heading and the `Drag the paper...` hint, in the page, the phone layout, tooltips and aria text. | [Prop] | unit + e2e | none |
| R2 | Desktop panel is half its baseline size (width and height). All remaining content fits with no clipping. | [Prop] | e2e | none |
| R3 | No address string in `dist/`, page metadata, JSON-LD or `README.md`. An `Email` link opens `mailto:`. The address is built at runtime from parts. | [Prop] | unit + e2e | none |
| R4 | Resume, GitHub, LinkedIn on one row with smaller buttons and text. `Email` joins the row if it fits. Otherwise it has its own line. | [Prop] | e2e | none |
| R5 | The panel shows `RArgu OS` only. The name, the title and the tagline are hidden in the source, not deleted. | [Prop] | unit + e2e | none |
| R6 | Each project window description is 20 words or fewer and fits in two lines. `line-clamp: 2` is a safety net only. | [Prop] | unit + e2e | none |
| R7 | The Notes window is post-it yellow, with a darker yellow title bar and dark text (WCAG AA) in light and dark mode. | [Prop] | unit + e2e | none |
| R8 | Tests, docs and the owner-question log match the new behavior. | [Prop] | unit | none |
| R9 | The public email is in no tracked file (owner scope addition 2026-10-27). The build reads it from a git-ignored local file. | [Prop] | unit + build | none |

### Acceptance

- **R9.a** The address comes from `content/private/email.local.json` (`{"emailParts": ["local", "domain"]}`, git-ignored
  through `content/private/`). The file is missing: the build succeeds and shows no Email link (panel, notice, resume).
  The file has bad parts: the build fails. The e2e build (`--mode e2e`) uses `tests/fixtures/sheet-content/email.json`
  (`test@example.invalid`), never the local file. The resume build reads the same local file (`DPOS_EMAIL` overrides).
- **R9.b** `node scripts/check-no-email.ts dist --tracked` prints `clean`: it scans `dist/` and every tracked file for
  the address, and the tracked files also for its local part. With no local file it prints
  `clean (no local email file: nothing to look for)`.
- **R9.c** The address is replaced in `docs/ledger/2026-10-24-spec-010.md` and in every mock source and file under
  `docs/mockups/` by `email@example.invalid`. A local-part-only match in `docs/ledger/2026-10-22.md` (an account folder
  name) is replaced by `<account>`. Mock hashes in `docs/mockups/README.md` are updated. The three `build.py` commands
  reproduce the new hashes (observed 2026-10-27). The mocks are HTML text, so no image holds the address.

- **R1.a** Given the built page (`dist/index.html`, the rail text, every accessible name), then `On this sheet`,
  `Drag the paper` and `look around` appear nowhere. The heading and the hint are deleted, not commented out (the owner
  asked to keep only the identity markup, R5). Negative tests build the strings from parts.
- **R1.b** Given the phone layout with the panel open, then the hint is not shown. The `<main id="vp">` label
  (`index.html:13`) no longer says `look around`. The new label is `Sheet`. Q2 covers the keyboard instruction. The project buttons keep their names.
- **R2.a** Given 1440x900, then `.rail` width is 140 to 150 px and height is at most 396 px (half of 791).
  The final width follows Q1.
- **R2.b** Given each of 1920x1080, 1440x900, 1024x700, 800x600, 761x600, 1280x500: `.rail.scrollWidth <= clientWidth`;
  every control and text box lies inside the rail rectangle; no text is clipped; each project name and its status label stay on one line; the rail has no vertical scroll at
  heights of 500 px or more. At 390x844 and 320x568 the folded bar and the opened panel fit the screen width.
- **R2.c** Given `prefers-color-scheme: dark`, then R2.a and R2.b still pass.
- **R3.a** Given `npm run build`, when I run the check below, then it prints `clean`. It prints `LEAK` on a match and
  `ERROR` when a read or the parts fail (a `grep` error is not `clean`):
  `node scripts/check-no-email.ts dist README.md` (new; reads `emailParts` from `content/identity.json`, fails on
  missing or empty parts, scans every file under `dist/` as text, including `.html`, `.js`, `.json`, `.map`, plus the
  README; it prints file names only, never the address).
  A unit test runs the same scanner on the production build and on the e2e fixture build (`vite.config.ts:19`, which
  enables write-ups, `/p/<id>/` pages and `case-studies.json`: `scripts/p-pages.ts:101,125`). Observed: the current
  production `dist/` has no `/p/` pages, so the production build alone does not cover that path.
- **R3.b** Given the page with JavaScript, when start-up ends, then each `a[data-mail]` has a real `href` of `mailto:`
  plus the joined address, and is no longer `hidden`. The href is set at initialization, not on first pointer or focus
  (an anchor without `href` cannot take Tab focus, and assistive activation can send `click` without `pointerdown`;
  Codex check with jsdom). The page source still has no full address. Tab reaches the link, Enter and a pointer click
  open the mail client (the e2e asserts the `href` and the accessible name `Email`; it cannot start a mail client:
  **Unverified** on a real client). No network call is made (request log shows no new request).
- **R3.c** Given JavaScript off, then no dead link shows: `a[data-mail]` has `hidden`. Q4 sets the visible fallback
  for the resume and the correction notice.
- **R3.d** One helper (`src/sheet/email.ts`) serves the panel, the correction notice (`sheet-content.ts:316`; the `Read`
  panel on `/p/` pages) and `insider-live/panel.ts:157`, which reads `#email` text today and must use the helper.
- **R3.e** The resume: `content/resume.md:3` holds the address and `scripts/build-resume-html.ts:28` renders it with no
  script (observed). The build replaces the address in the resume body with an `a[data-mail]` and adds one small
  script to `resume.html` that sets the `href`. `content/resume.md` carries a placeholder token, not the address.
  Q4 decides whether the printed resume must show the address (set by the script, so it is on the page at runtime
  only).
- **R3.f** Removing `#copy` also removes its handler (`src/sheet/main.ts:113`, which runs unguarded and would stop
  start-up if the button is missing) and the now-unused message code. Acceptance: the page loads with no page error;
  navigation buttons and Reset still work.
- **R4.a** Given 1440x900, then Resume and GitHub sit on the top row and LinkedIn and Email on the row below (equal
  `top` in each row), with button font 10 px or more. (Changed by the owner 2026-10-28: see answer 8.)
- **R4.b** Given any desktop or phone size, then the four links are a symmetric 2 x 2 grid: two columns of equal width,
  equal `left` in each column, every button as wide as its cell. No wrapping inside a button. Without JavaScript the
  Email cell is empty (R3.c).
- **R5.a** Given the built page, then `.who` and `.tag` are not rendered, and `Rodrigo Arguello`, `Software Engineer`
  and the tagline do not appear in the panel. The markup stays in `card()` as a source comment (outside the returned HTML, with
  a `TODO(owner): restore` note), and the CSS rules stay.
- **R5.b** Page title, `og:title`, `og:description`, the meta description and the `Drawn by R. Arguello` title block
  are unchanged. The build still needs `name`, `title`, `tagline` in `identity.json` (`sheet-content.ts:203`).
- **R6.a** Given the table below, then each `summary` in `content/projects/*.md` equals the proposed copy.
  A unit test fails when a window summary has more than 20 words.
- **R6.b** Given each of the five windows at zoom 1, fonts loaded, `line-clamp` removed in the test, with and without
  JavaScript, then `.blurb` `offsetHeight` (unscaled) is at most 47 px (2 lines of 23.25 px). A bounding box at another
  zoom is not used (zoom is a transform, `src/sheet/view.ts:53`).
- **R6.c** Metadata and the write-up body of `/p/` pages do not use `summary` (they use `writeup.lede`). Observed:
  `grep -rn summary scripts worker src` finds no other use. The copied sheet HTML in `/p/` pages does carry the new
  summaries (`scripts/p-pages.ts:101`). Verify a `/p/` page with JavaScript on and off.
- **R7.a** Given light and dark mode, then the Notes window body, title bar and menu/status chrome use the colors in the
  Notes table below. The computed contrast of each text and background pair is at least 4.5:1.
- **R7.b** Given dark mode, then the Notes window stays yellow with dark text. The host writes `--p*` and `--t-*`
  directly on every `.host-root` (`src/sheet/host/styles.ts:26-35`), and the menu has its own root
  (`src/sheet/host/window.ts:195`). A rule on `[data-win="notes"]` alone cannot win. The override targets
  `[data-win="notes"] .host-root` and the menu root of that window, and sets the roles `--document`,
  `--document-text` (textarea, `src/ui/base.css:249`), `--text`, `--text-inverse`, `--chrome`, `--chrome-dark`,
  `--title-active`, selection, hover and active. The status bar shares `--chrome` with menus, so it is set apart.
- **R7.d** After Notes starts, and again after a scheme change, the test reads the computed colors of: body text,
  title bar, bar buttons (dark chrome is `#5f574f` today: brown on it is 1.94:1, so the buttons take the yellow
  chrome), open menu items (`--title-active` on `--text-inverse`, `base.css:792`), selected text, Find controls and
  focus rings. Every text pair is at least 4.5:1 and every ring or border at least 3:1. The host's focus-band checks
  stay.
- **R7.c** Other windows are unchanged in both modes (screenshot compare).

## Description copy (R6)

Window = layout slot in `src/sheet/layout.ts`. Counts are `split(" ")` of the text (observed, Python). The text is the
`summary:` line in the front matter of the listed file. Characters are shown because two lines hold about 150 characters
at the narrowest window text width (568 px; inferred from 3 lines for 187 to 273 characters).

| Window (file) | Current | Words | Proposed | Words | Chars |
|---|---|---|---|---|---|
| Castle Siege (`castlesiege.md`) | Two-player turn-based strategy on a 7×9 board. Fewer pieces than chess, with mismatched move and attack ranges. Online with ranked matchmaking, or against a bot that runs in your browser. | 30 | Two-player strategy on a 7×9 board with mismatched move and attack ranges. Play online or against a browser bot. | 19 | 112 |
| Castle Wars (`castlewars.md`) | An auto-battler set in CastleSiege's world. The units are hand-animated pixel art; the battle engine is next. These are the real sprite sheets. | 23 | An auto-battler set in CastleSiege's world. The hand-animated pixel-art units are done. The battle engine is next. | 17 | 114 |
| Pentimento (`pentimento.md`) | A native macOS raster editor in the spirit of Paint.NET, built so AI agents can drive it with real tools. It follows PaintDotMac, a Swift/Metal prototype whose compositor matched Paint.NET pixel for pixel. | 33 | A planned macOS raster editor in the spirit of Paint.NET, designed so AI agents can drive it with real tools. | 20 | 109 |
| Crawler (`focused-web-crawler.md`) | Give it a topic and four strategies crawl side by side: URL keywords, static similarity, adaptive similarity, and an LLM judge. One evaluator scores precision, domain diversity, and overlap. I built the LLM strategy and the evaluation layer. | 38 | Four crawl strategies compete on one topic, scored by one evaluator. I built the LLM strategy and the evaluator. | 19 | 112 |
| Insider Trading (`polymarket-insider-trading.md`) | A PySpark pipeline over 226K+ on-chain fills across 6 geopolitical markets ($240M+ volume). It finds sharp price moves, traces the wallets that bet big just before them, and scores those wallets against a GDELT news timeline. It flags candidates; it doesn't prove anything. | 43 | A PySpark pipeline over 226K+ Polymarket fills. It flags wallets that bet big before sharp price moves. Candidates, not proof. | 20 | 126 |
| Paint, Music, Notes (quick tools) | No description today (`sheet-content.ts:360`: only windows with a project file get `.about`). | 0 | No change | 0 | n/a |

Notes on the copy:

- Castle Wars: the old text said "These are the real sprite sheets". The proposal drops it. The write-up does not say
  it (`content/projects/castlewars.md:8` is the only place), so the claim leaves the page.
- Pentimento: the write-up says "Status: planning. Nothing is built yet" (`pentimento.md:13`). The proposal says
  "planned" and "designed" so it does not imply a finished product.
- Insider: the old text said "doesn't prove anything". The proposal keeps the warning as "Candidates, not proof". The
  case-study notice (`sheet-content.ts:317`) is unchanged. NEEDS OWNER Q5.
- Whole-Plant Ice Cream has no `summary` and no window (`content/projects/whole-plant-ice-cream.md`). No change.
- Layout risk: a 2-line blurb is 23 px shorter than a 3-line blurb (47 vs 70 px, observed). Window heights in
  `layout.ts` are fixed and `.demo-area` is `flex: none` (`sheet.css:346`), so it cannot absorb the gap. Plan: lower
  `h` by 23 px for castlesiege, pentimento, crawler and insider (castlewars is already 2 lines), and check that no
  demo area is cut. This is a recorded `compare-vs-mock` difference. Q5 asks the owner.

## Notes window colors (R7)

Palette idea: a warm paper yellow like a post-it. Not `#ff0`. The skill `better-ui` fixes no color. It gives surface
rules: concentric radius (not used here: the project has square corners by convention) and layered shadows for depth
(`.agents/skills/better-ui/surfaces.md:94`). The site's hard offset shadow (`sheet.css:188`) is a project convention
and stays, so the window sits with the others. The ratios are WCAG 2 (observed, Python, 2026-10-27).

| Part | Hex | Use |
|---|---|---|
| Window body (`--win-bg` for this window) | `#fff3a8` | background of the window, text area, status bar |
| Title bar | `#f4dc6b` | `.bar` background (darker yellow) |
| Chrome (menu row, bar buttons) | `#e8cf55` | borders of menus; bar buttons keep their own `--chrome` if it passes |
| Text | `#3b2a14` | all body text and title text (dark brown) |
| Dim text | `#5c4423` | hints, status bar text |
| Outline | `#1d2b53` (light) / `#000` (dark, unchanged) | window border |
| Fold corner (optional) | `#e8cf55` | 14 px triangle, bottom right, one `linear-gradient` on `::after` |

| Pair | Ratio | AA (4.5:1 text) |
|---|---|---|
| Text `#3b2a14` on body `#fff3a8` | 12.20:1 | pass |
| Text `#3b2a14` on title bar `#f4dc6b` | 10.02:1 | pass |
| Text `#3b2a14` on chrome `#e8cf55` | 8.83:1 | pass |
| Dim `#5c4423` on body `#fff3a8` | 8.08:1 | pass |
| Dim `#5c4423` on title bar `#f4dc6b` | 6.63:1 | pass |
| Outline `#1d2b53` on body `#fff3a8` | 12.24:1 | pass (needs only 3:1) |

The unit test recomputes these ratios from the real CSS values, as `tests/unit/demo-contrast.test.ts` does for the demos.

## Approach

Smallest change per requirement:

- R1, R5: edit `card()` in `scripts/sheet-content.ts`. Delete the `h2` and the hint. Move the `.who` and `.tag`
  lines into a source comment. Keep the `.hint`, `.who`, `.tag` CSS. Remove the `#copy` button and its handler
  (`src/sheet/main.ts:113`).
- R2, R4: `.rail`, `.logo`, `.cta`, `.btn`, `.index` in `src/sheet/sheet.css` get a smaller scale in a desktop media
  query (`min-width: 761px`). Font floor: 10 px (the pixel font is hard to read below). Measured text widths in
  Pixel Operator (observed, canvas `measureText`): at 10 px, `Resume ↗` 40, `GitHub` 24, `LinkedIn` 33, `Email` 21 px
  (total of the first three: 97 px). Current buttons need 191 px for the row (Codex, from `sheet.css:470,483`).
  Row budget at width 150 (derived): panel border 2 + 2, padding 6 + 6, inner 134 px. Button: font 10 px, border 2 px
  (4 px per button), padding 0 3 px (6 px), gap 3 px: 97 + 3x10 + 2x3 = 133 px. It fits with 1 px spare. At width 140
  the inner width is 124 px: the row needs a 1 px button border (97 + 3x8 + 2x3 = 127 px, inner 128 px with panel
  padding 5, 1 px spare) or 9 px text. `Email` (21 + 10 = 31 px) never fits on the same row, so it takes its own line.
  Quick tools: three cells of 36 px (24 px icon) with 6 px gaps = 120 px, fits. Project rows: 10 px name and status
  on one line; `Focused Crawler demo` is about 90 px (inferred). Control height at least 18 px. No JS change for size.
- R3: new `src/sheet/email.ts`. The parts live in `content/identity.json` as `emailParts` (replacing `email`;
  `readIdentity` at `sheet-content.ts:196` and the type in `tests/e2e/sheet.spec.ts:79` change) and reach the client as
  separate strings, never as one string. At start-up one function sets the `href` of every `a[data-mail]` and removes
  `hidden`. The markup is `<a data-mail hidden>Email</a>`. The build runs `scripts/check-no-email.ts` (R3.a).
  `README.md` and `content/contact.md` carry no address (`contact.md:3` uses the same placeholder as the resume).
- R6: edit five `summary:` lines. Add a unit test for the word limit. `.blurb` gets `-webkit-line-clamp: 2` as a net.
- R7: a `[data-win="notes"]` block in `sheet.css` (window and bar) plus role overrides on the Notes host roots
  (R7.b), with the colors above, both color schemes. The rule that bars sheet selectors from reaching into app
  descendants (`tests/e2e/host-styles.spec.ts:288`) is kept: the override is scoped by the window's own attribute.
- Alternatives rejected: a CSS-reversed or HTML-entity address (a plain-text scraper still reads it); a server form
  (breaks "static, no network"); halving the panel with `transform: scale(.5)` (text becomes 7 px).

## Boundaries

- **Always:** keep the site static; respect `prefers-reduced-motion`; run `npm run lint`, `npm test`, the relevant
  `npm run e2e`; write copy as the owner's voice (first person where it is today).
- **Ask first:** `npm run deploy`, `deploy:live`, `git push`, a PR, a new dependency, a new network call.
- **Never:** print the public email in a spec, ledger, log or chat; commit `art-source/` or `.claude/`; delete the
  hidden panel markup; touch page title or metadata.

## Done when

1. `npm run lint`, `npm test` pass. `npm run e2e` (chromium + mobile projects) passes, with the e2e below updated.
2. Check R3.a prints `clean` on a fresh `npm run build`.
3. `compare-vs-mock` is done for 1440x900, 1024x700, 390x844, light and dark. Every difference has a reason: owner
   decision (spec 015) or defect. No other difference is accepted.
4. The owner has approved the description table and the Notes colors in this spec.
5. No deploy, push or PR without the owner.

E2E and unit tests that check removed or changed text (observed, `grep`): `tests/e2e/compact-sheet.spec.ts:423-445`
(`#email` hidden and visible), `tests/e2e/sheet-card.spec.ts:157-162` (`#email`, `#copy`),
`tests/e2e/host-load.spec.ts:115,293` (`#copy` focus), `tests/e2e/host-styles.spec.ts:43` (`#copy` as the card button),
`tests/e2e/sheet.spec.ts:79` (identity type), `tests/unit/sheet-content.test.ts:53` (`test@example.com` in the card),
`tests/unit/names.test.ts:32-40` (title; stays true), `tests/e2e/castlewars.spec.ts:402,723` (blurb box; heights change).
More (Codex, checked): `tests/e2e/host-styles.spec.ts:461` (old Notes theme values; changes with R7) and `:288` (no sheet
selector may reach app descendants; kept), `tests/unit/sheet-content.test.ts:236` (tagline in the card; becomes a test
that the card hides it), `tests/e2e/sheet.spec.ts:93` (name, title, tagline and email without JS; changes to R5 and
R3.c), `tests/e2e/readme-case-studies.spec.ts:45` (expects a mail link before any click; now checks `a[data-mail]`
after start-up). Each replacement keeps its original aim: theme isolation, focus, escaping, correction-link coverage.
Fixture: `tests/fixtures/sheet-content/identity.json:5`.

## Name instances (R5)

| Where | Path:line | In panel? | Action |
|---|---|---|---|
| Panel name line `Rodrigo Arguello` | `scripts/sheet-content.ts:236` (from `content/identity.json:2`); built at `dist/index.html:22` | **panel** | hide |
| Panel title `Software Engineer` | `scripts/sheet-content.ts:236` (`identity.json:3`) | **panel** | hide |
| Panel blurb (tagline) | `scripts/sheet-content.ts:237` (`identity.json:4`) | **panel** | hide |
| Page `<title>` and `og:title` | `scripts/site-identity.ts:22-47`; `dist/index.html:6,10` | page | leave, report |
| Meta description and `og:description` (the tagline text) | `scripts/site-identity.ts:30-47`; `index.html:7` | page | leave, report |
| Title block `Drawn by R. Arguello` | `index.html:18` | page (sheet corner) | leave; NEEDS OWNER Q3 |
| Resume page title and `<h1>` | `dist/resume.html:6,21`; `content/resume.md:1,3` | page | leave |
| CastleSiege About text `by Rodrigo Arguello` | `src/apps/castlesiege/main.ts:980` | inside an app | leave |
| Crawler panel text `Rodrigo's computer` | `src/sheet/demos/crawler-live/panel.ts:98,161,253` | inside a window | leave |
| Vendor notes, tests | `src/apps/castlesiege/VENDOR.md`, `tests/unit/*.test.ts` | no | leave |

## Email in the repo (R3, observed)

`grep -rlF` on tracked files finds the address in `content/identity.json:5`, `content/resume.md:3`,
`content/contact.md:3`, `docs/ledger/2026-10-24-spec-010.md`, and the mock files under `docs/mockups/`. In `dist/` it is
in `index.html` (panel and case-study notice) and `resume.html`. The repository is public (`rargu-os`), so the address
stays readable in old commits. R1 to R8 hide it from the served site. R9 (owner scope addition, 2026-10-27) removes it from the tracked files too, but history is not rewritten. This reverses the earlier owner
decision to show the public email (`docs/OWNER_QUESTIONS.md:25`: "email with copy"; recorded in the owner's memory as an
approved content decision). Task last adds a row to `docs/OWNER_QUESTIONS.md`: 2026-10-27, email hidden behind an
`Email` link, built at runtime.

## Out of scope

- A new mock (v0.9). Restoring the name, title or blurb. Rewriting git history (the address stays in old commits; open with the owner).
- Changing page title, `og:*` or the meta description. Changing the phone bar's size.
- Text of write-ups or the Read panel.

## Open questions

Five need the owner (`interview` skill, step 3). Each has a recommended answer.

- **NEEDS OWNER Q1 (panel width).** Half of 280 is 140 px. At 10 px text the three buttons need 127 px in a 124 to 128 px
  inner width, so 140 works only with 1 px button borders and 1 px spare. Options: A) 150 px wide, 2 px borders
  (133 of 134 px). B) 140 px, 1 px button borders. C) 140 px, 9 px text (hard to read). Height is half (at most
  396 px at 1440x900) in all options. **Recommend A.**
- **NEEDS OWNER Q2 (keyboard hint).** `index.html:13` tells keyboard users to use the arrow keys. R1.b makes the label
  `Sheet`. Options: A) drop it. B) keep a short `aria-describedby` text without the words "drag the paper" or "look
  around" (for example "Arrow keys pan the sheet"). **Recommend B**: screen reader users lose their only hint
  otherwise, and it is not visible text.
- **NEEDS OWNER Q3 (name).** Remove only the panel name, title and tagline (R5)? The title block `Drawn by R. Arguello`
  (`index.html:18`), page title, `og:*`, meta description and the resume keep his name (table above).
  **Recommend yes, panel only.**
- **NEEDS OWNER Q4 (email on the resume and the correction notice).** Without the address in the source, a visitor with
  JavaScript off gets no mail link. Options: A) a small script sets the link on the resume and the notice; with JS off
  the text says "Email needs JavaScript"; the printed resume shows the address, set by the script. B) the resume shows
  an `Email` link only. **Recommend A.** The correction route of spec 013 R18 stays.
- **NEEDS OWNER Q5 (copy and window heights).** Approve the table above (Pentimento "planned", "designed"; the dropped
  "real sprite sheets" line; Insider warning shortened to "Candidates, not proof") and lowering four window heights
  by 23 px. **Recommend yes to both.**
- To confirm with Q5: the Notes window is yellow in whole (body and title bar), with the colors above. **Recommend yes.**

## Critique

Codex (`gpt-6.1-sol`, high, read-only) gave 14 findings. Output and dispositions:
`docs/review/spec-015-critique-codex.md`.

## Owner answers

Owner approved this spec on 2026-10-27 (relayed by the coordinator). Answers to Q1 to Q5 and the Notes confirmation:

1. Panel width: 150 px, 2 px borders. Height half.
2. Keyboard hint: label `Sheet` plus a non-visible `aria-describedby` text "Arrow keys pan the sheet". Nothing visible.
3. Name: removed from the side panel, and the `Drawn by R. Arguello` title block (`index.html:18`) is hidden too.
   Hide or comment out, do not delete. Page title, metadata, resume and in-app mentions stay. (Found while
   implementing: the panel's `aria-label="About Rodrigo"`, `index.html:11`, also names him. It becomes `Side panel`.)
4. Email on the resume and the correction notice: the same runtime-built link on both. With JavaScript off the text
   is "Email needs JavaScript". The printed resume shows the address, filled in by the script. The address string is
   not in `dist/`.
5. Copy table approved as written. Lowering the four window heights by 23 px is approved.
6. Notes: whole window yellow. Colors approved as proposed (`#fff3a8` body, `#f4dc6b` title bar, `#e8cf55`
   chrome and corner, `#3b2a14` text, `#5c4423` dim text, hard offset shadow kept).

Q1 changes R2.a: width 150 px (not 140 to 150).

### Change after approval: 2026-10-27, owner scope addition (R9)

7. The public email is removed from the repo too, not only from the served site. No tracked file on `spec-015-panel`
   may hold the address or its local part. Git history is not rewritten and nothing is pushed. The orchestrator asks
   the owner about history separately.

### Change after approval: 2026-10-28, owner request (R4)

8. The link buttons are "symmetrical": as many on the top row as on the bottom, as many left as right. A 2 x 2 grid,
   sizes adjusted to fit (owner, from a screenshot of the preview). Implemented: `.cta` is a two-column grid of equal
   cells on desktop and phone; on desktop the link text is 12 px (was 10 px), Reset page stays 10 px.

## Approval record

2026-10-27: Approved with the answers above. No gate (deploy, push, PR) is approved.
