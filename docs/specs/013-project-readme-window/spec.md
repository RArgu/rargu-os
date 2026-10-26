# 013: Project write-ups and the expandable Read view

**Status:** Approved 2026-10-26 (was Critiqued) · **Owner approval:** 2026-10-26 · **Gates
needed:** none for the build; G-deploy to ship
**Related:** 001 (windows, R17 reduced motion, R18 contrast, R19 keyboard, R22 budget), 006 (crawler and insider
demos), 011 (crawler live, `docs/specs/011-crawler-live/spec.md`), 012 (insider live,
`docs/specs/012-insider-live/spec.md`), mock v0.7 (`docs/mockups/README.md`), reference study
[`reference-notes.md`](reference-notes.md), write-up plan [`writeup-outlines.md`](writeup-outlines.md), critique
[`docs/review/spec-013-critique-codex.md`](../../review/spec-013-critique-codex.md) (17 findings).

## Why

A visitor can use a project window, but cannot learn how the project works. The owner wants each project to have a
case-study write-up (what it is, uses, how it works with a system design diagram, challenges, results), in the style
of `https://monicagraham.dev/codex-cad`. The write-up opens inside the project's own window. An Expand control makes
that window cover the page. The write-ups describe the **new live builds** (011, 012): the challenges are the ones met
while building them, and the results come from our own runs. The course projects become a short Origin section with
credit. The first two write-ups are the Focused Web Crawler and Insider Trading. Owner request 2026-10-26.

## Owner answers 2026-10-26

Relayed by the orchestrator.

**Round 1** (closes Q1 to Q8 of the first draft):

| Q | Answer |
|---|---|
| Q1 Modes | Demo / Try / Read tabs in the title bar. |
| Q2 Read and Expand | Read opens in the window. Expand is optional. On phones, Read always expands. |
| Q3 Deep links | Static pages at `/p/<id>/`. |
| Q4 Scope | The mechanism for all project windows. Only the crawler and insider write-ups now. |
| Q5 Text | In the existing `content/projects/*.md`. Short fixed headings, one bold claim sentence at the start of each section. |
| Q6 Expand | In every mode, project windows only. Not the Quick tools. |
| Q7 Media | The diagram only. No other images or charts. |
| Q8 Insider case studies | Show the report's case studies as they are (owner's choice, against the draft's recommendation). See Risks. |

**Round 2:**

| Topic | Answer |
|---|---|
| Framing | "We're making 'new projects', so the challenges will be what we face with the new builds." "We'll write it up based on what we do." Each write-up is about the 011/012 build. The course project is a short Origin section with credit. |
| Crawler results | Our own evaluation with the new build (011 adds an eval task), shown as a small HTML table (N2). |
| Crawler team | The owner did the LLM strategy and the evaluations. Harry did the frontend, the normal crawl and the original evaluations (011 confirms from commits; corrected in round 3). The zip was only in the solo crawler first. The new build has zips. |
| Insider team | The owner designed the analysis phases. Shwetanshu Raj built the notebooks and ingestion. Credit him for the original project and link his GitHub. The 3 open markets resolved (corrected in round 3: 2 of 3). No need to ask him before shipping (N4). |
| Ship order | A write-up and its tool ship together (N1). |
| Corrections | Email, with a stated reply within 7 days (N3). |
| Ollama chip | Stays. The live judge is a small model, CPU only, on the owner's 2018 MacBook Pro. |
| 012 images | 012 shows Polymarket profile pictures (owner's choice, 012 scope). The write-up still has no images (Q7). |

**Round 3:**

| Topic | Answer |
|---|---|
| N5 Case studies | Shown as in the report, loaded from a small `noindex` JSON file when Origin opens. |
| N6 Insider tabs | Try and Read only. Try opens first, on the Maduro market. |
| N7 Stack chips | The live build's stack. The course stack is named in the Origin text. |
| N8 Resolved-markets check | Owner's choice: publish the check only if the live rule flags the report's wallets. If it does not, Results leaves the check out. |
| Insider numbers | "333K on-chain fills across 6 markets (~$256M volume when collected)" (012 research §10). Content task C6 updates the two content files. |
| Correction | Only 2 of the 3 open markets resolved. "China invades Taiwan" is still open, and the live tool refreshes it each night. |
| Crawler evaluation | 10 topics × 3 runs (011). |
| Crawler credit (011 commit check) | The owner built the LLM strategy and the evaluation layer on `LLM-Page-Selection`, the more complete branch. Harry built the pipeline, seeds, URL priority, the similarity crawlers, and the original labeler and precision plot on `master`. Neither branch has frontend code. |
| Shwetanshu | GitHub `shwetanshu07`. |
| Still open (TODO-owner) | Harry's full name and link. May the write-up name the 2018 MacBook Pro? The year line. |

**Round 4** (reconciliation, after the 011/012/013 critiques):

| Topic | Answer |
|---|---|
| N9 Case-study load | (b) When Origin scrolls into view. The owner accepts the indexing risk. R18 keeps its honest wording and `data-nosnippet`. |
| N10 Publish rule | (c) Publish all rows if a majority of the report wallets expected as candidates is listed and the market maker is not listed. Else Results leaves the check out. |
| Look-back | 24 h kept (owner). 012 found that Vivaldi007 bet about 115 h before its spike, so the 24 h rule will likely not list it. |
| Shared infra | 011 owns the Worker, router, `Limits`, wrangler bindings and `public/_headers`. 013 adds its own `_headers` lines (case-study JSON) in its own tasks. |
| Event contract | 013 owns `tool:stage` and `tool:status` (section "Event contract"). |

Sibling-track facts used here (relayed 2026-10-26, and read in the 011/012 drafts):

- v1 runs on the Cloudflare Free plan.
- 011: the browser drives the crawl one page per Worker request. The LLM judge goes through the Worker and a Tunnel to
  Ollama on the owner's computer, and can be offline. A Workers AI model labels pages for the evaluation
  (`docs/specs/011-crawler-live/spec.md` R5–R9).
- 012: the spare computer collects a fixed set of markets each night through Polymarket's Data API v2 and pushes
  results. Visitors browse them and can request a market for the next night. Goldsky's public subgraph is deprecated.
  The score is a points rule, not the course project's random forest (`docs/specs/012-insider-live/spec.md`
  assumptions 1, 5, R6–R11).

## Assumptions

1. A window has up to three modes: **Demo** (a demo, such as 006), **Try** (the 011/012 tool) and **Read** (the
   write-up). (Owner, Q1.)
2. "Fullscreen" means that the window covers the rargu.dev page. It does not use the browser Fullscreen API.
3. On a phone a window shows at about 0.55 zoom (**inferred** from 001 R15), so Read expands there. (Owner, Q2.)
4. Today only the frontmatter of `content/projects/<file>.md` reaches the site (`scripts/sheet-content.ts:57`).
   [Code]
5. `public/_redirects` sends `/projects/*` and `/work/*` to `/` with a 301. [Code] The deep links use `/p/`.
6. Themes follow `prefers-color-scheme` only, with tokens on `:root` (`src/sheet/sheet.css:40-82`). [Code]
7. The markdown renderer drops raw HTML and gives each H2 an id (`src/apps/resume/doc.ts:82-126`). [Code] So a diagram
   comes from its own file.
8. No window content uses an `<iframe>` (`grep -rln iframe src/sheet src/apps`, 2026-10-26). [Code] So moving a
   window's node keeps canvas, timers and listeners.
9. Write-up text for Challenges and Results does not exist yet. It comes from the 011/012 builds as they happen
   (owner, round 2). So the write-up content is a task inside each build, not a separate step after it.

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Each project window (CastleSiege, Castle Wars, Pentimento, crawler, insider) has a mode switch in its title bar: Demo · Try · Read. A tab shows only when its mode exists for that window. With one mode, there is no switch. ARIA tabs pattern: a `role="tablist"` with an accessible name ("<project> view"); each tab is a native `<button role="tab">` with `aria-controls` to its panel; each panel is `role="tabpanel"` with `aria-labelledby` to its tab. The current tab has `aria-selected="true"` and `tabindex="0"`, the others `tabindex="-1"`. Left and Right arrows move between tabs and select (wrap at the ends); Home and End go to the first and last tab. Pressing or arrowing a tab does not start a drag or pan the sheet. | [Prop] | e2e | — |
| R2 | Each project window has an Expand control in its title bar (⤢, name "Expand <project>"). The Quick tools windows do not. Expand makes the window cover the page viewport, above the sheet, card, minimap and zoom controls, and below the toast. The control then shows ⤡, named "Restore". Restore puts the window back at the same sheet position, with the same zoom and scroll. Expand works in every mode. | [Prop] | e2e | — |
| R3 | Read opens in the window at its sheet size. The Read panel scrolls inside the window and owns its input: (a) wheel: `overscroll-behavior: contain`; (b) touch: the panel has `touch-action: pan-y` and is in the sheet's no-pan list (`NOPAN`, `src/sheet/view.ts:22`), so a touch in it never starts a sheet pan; (c) keys: arrows, Page Up/Down, Home/End and Space with the focus in the panel scroll the panel and never pan the sheet, also at the panel's ends. Under 760 px, Read also expands. | [Prop] | e2e | — |
| R4 | Expanded: the window is a modal dialog (`role="dialog"`, `aria-modal="true"`, labelled by the project title). The sheet, card, minimap and zoom controls are `inert`. **Initial focus:** the control that expanded the window keeps the focus (it is in the window); on direct entry (R12) the focus goes to the Read panel's heading (`tabindex="-1"`). **Trap:** Tab and Shift+Tab cycle inside the window. **Esc:** a capture-phase handler on the dialog restores, except (a) when the focus is in a Try or hosted-app area: that area owns Esc (002's Esc then Tab rule for hosted apps such as CastleSiege, `src/sheet/host/window.ts:310-318`), and Esc restores only after the focus has left the area; (b) when a control calls `preventDefault()` on Esc. **After Restore:** the focus goes to the Expand control, also after direct entry (R20). | [Prop] | e2e | — |
| R5 | Expand and Restore animate between the window's on-screen rectangle and the viewport (FLIP, 240 ms ± 20, ease-out, transform and opacity only). With reduced motion, the change is an opacity fade of 120 ms or less, with no movement. A preference change during the animation ends it at its end state at the next frame. After the animation, no animation frame runs while nothing moves (001 R22). | [Prop] | e2e | — |
| R6 | A demo or tool keeps its state through Expand, Restore and tab changes. The window's node moves, and is not rebuilt. A placeholder of the same size stays in the sheet. **Visible** (for the 006 visibility rule, `src/sheet/demos/visibility.ts:87`) = the browser tab is visible **and** (the window is expanded, or it overlaps the view) **and** that panel is the selected one. While another window is expanded, every other window is not visible. Not visible stops animation only. It never cancels a Try run in progress; the tool decides what a hidden run does (011/012). | [Prop] | e2e | — |
| R7 | While a window is expanded, its title bar does not drag, throw or send home. Pan, zoom and wheel do not reach the sheet. After Restore, drag, throw and Home work again, with the window's inline transform as before. | [Prop] | e2e | — |
| R8 | Read layout: a title block (title, year, status, role line, stack, links), a lede of 1 to 2 sentences, then the H2 sections in this order: **Overview, Uses, How it works, Challenges, Results, Origin**. Each section starts with one bold claim sentence. A section nav lists the H2 sections and marks the current one (`aria-current="true"`) while the reader scrolls. Expanded at 760 px or wider: nav in a left column, text column at most 68 characters. Narrower, and in the unexpanded window: nav is one row of chips at the top that scrolls sideways. Text has 16 px side gutters at 390 px. Every id in a write-up has the window id as a prefix (`crawler-sec-results`), so ids are unique in the whole sheet page. | [Prop] | unit + e2e + compare-vs-mock | — |
| R9 | "How it works" has one diagram: the live system as built in 011/012. It is HTML, built at build time from `content/projects/diagrams/<file>.json`. Schema: `{ caption, tiers: [{ boxes: [{ id, label, name, keywords, note?, stage? }], loop?: { to: <box id>, text } }] }`. `id` is unique in the diagram. `stage`, if present, must be one of the tool's stage ids, used once. Every stage id of the tool must appear on one box. Arrows join each tier to the next; a `loop` draws a labelled return arrow to an earlier box. Colours come only from CSS tokens. A tier wraps to fewer columns at narrow widths, so no sideways scroll at 390 px. No other images or charts (Q7). | [Prop] | unit + e2e | — |
| R10 | Stage highlight follows the Event contract (below). One box is active at a time: the stage of the latest `start`. A `done` or `error` for that stage, or `{ stage: null }`, clears it. An `error` shows "stopped" on that box until the next `start` or `null`. The active box has an accent outline and a text marker: "running" for `mode: "live"` (crawler), "drawing" for `mode: "replay"` (insider stored result). The marker is announced once per stage through `aria-live="polite"`. 013 draws at most once per animation frame (the latest event wins). With reduced motion the change has no animation. | [Prop] | e2e | — |
| R11 | Status follows the Event contract. Crawler: the `gate-d` box shows "offline" or "busy" in text (busy = the nightly job or another visitor's run; no reason field). Insider: a status line under the diagram says "Last run <time> · next run <time> · <n> requests waiting", times in the visitor's local time. With no status yet, nothing changes for the crawler, and the insider line says "Status not available". | [Prop] | e2e | — |
| R12 | Deep links: each write-up has a page at `/p/<id>/` (`/p/crawler/`, `/p/insider/`). It is the built sheet page (`dist/index.html`) with: its own `<title>`, description, canonical URL and link-preview tags; `data-open="<id>:read"` on `<body>`; and every asset URL made absolute (`/assets/…`), because the build uses `base: "./"` (`vite.config.ts:55`). With JavaScript, the sheet starts with that window expanded in Read. The sheet guard (`scripts/sheet-guard.ts`) checks these pages as it checks `/`: asset URLs resolve, and the 001 R22 budgets hold. A project with no write-up has no `/p/` page; its URL gets the 404 page. History follows R20. | [Prop] | unit + e2e + e2e:routing | — |
| R13 | Without JavaScript: (a) on `/p/<id>/`, CSS keyed on `data-open` shows the write-up as a normal page (the window full width, no fixed height, no clip, the other windows and the sheet hidden), every section visible by page scroll at 1440 × 900 and 390 × 844; (b) on `/`, a window with a write-up shows a "Read the write-up" link to `/p/<id>/` and not the Read panel (the window is fixed height with `overflow: clip`, `src/sheet/sheet.css:192`). The insider case studies need JavaScript (R18). | [Prop] | e2e (JS off) | — |
| R14 | Contrast: all write-up text, diagram labels, box borders, the active-stage outline, the markers and the status line meet 001 R18 in both themes. | [Prop] | unit | — |
| R15 | Budget: both 001 R22 limits hold on `/` and on each `/p/<id>/` page: the shell (first load) ≤ 100 KiB gzip and everything the sheet can load ≤ 150 KiB gzip, JS + CSS, fonts excluded (`scripts/sheet-guard.ts:79,82`). Write-up text and diagrams are HTML, not JS. No new runtime dependency. | [Prop] | build | — |
| R16 | Network: from `/` and `/p/<id>/`, through Read, Expand, Restore, the section nav and Origin, the page requests only its own files and the 010 R9 allowlist (the Cloudflare beacon), plus what 011/012 add for Try under their own G-net approval. 013 code itself requests only `/p/insider/case-studies.json`. | [Prop] | e2e | G-net |
| R17 | Ship rule: a project gets `writeup: true` in the same release as its tool. The build then requires the six H2 sections of R8 in order, a bold claim sentence at the start of each, a role line, a results table or text with a date and a run count, a credit line in Origin, no `TODO` text in the shown content, and a diagram file that passes the R9 schema. A failure stops the build and names the file. | [Prop] | unit | — |
| R18 | Insider case studies (Q8, N5): the Origin section shows the course report's case studies as they are. Directly above them, in the static HTML, a notice: the wallets are candidates from the course project's heuristics, not proof of insider trading, the figures are from the final report (2026-05-18), and a correction or removal request goes to the site email, with a reply within 7 days. The case studies are not in any static HTML. They load from `/p/insider/case-studies.json` (`X-Robots-Tag: noindex` and `Cache-Control: max-age=300` from `public/_headers`) when Origin first scrolls into view (`IntersectionObserver`; owner, N9), into a container with `data-nosnippet`. The source file is `content/projects/insider-case-studies.json`; the build copies it to `dist/p/insider/case-studies.json`. **What this protects:** no address is in the first HTML of any page. It does **not** stop a search engine that runs JavaScript and scrolls from seeing the shown addresses (the owner accepts this risk, N9). If the JSON does not load, Origin keeps the notice and says the case studies did not load. | [Prop] | e2e | — |
| R19 | Removal for 013's copy (owner promise: reply within 7 days): (1) remove the entry from `content/projects/insider-case-studies.json`; (2) build and deploy (G-deploy, the owner's OK each time); (3) reply to the sender. **How long old copies last:** a browser that fetched the JSON may reuse it from its HTTP cache for up to 5 minutes after the deploy (`max-age=300`); a page that is already open keeps its copy until it is reloaded; a saved page, screenshot or search-engine copy can last any time and cannot be recalled. The notice states both removal times in plain words: "A market can be hidden at once. A case study below is removed
with the next site update. We reply within 7 days." (012 R13 hides a market or wallet with no deploy. The case-study
JSON needs a deploy.) It also says, in one sentence, that copies already saved by others cannot be recalled. Whether Cloudflare's edge keeps the old file after a deploy is **Unverified**; the removal check fetches the URL after the deploy. Copies that 012 holds (result JSON, bundled fallback, pictures) follow 012's removal path. | [Prop] | unit + manual | G-deploy |
| R20 | URL, mode and expansion follow the transition table below. Back and Forward always give the state the table names. Scroll position in the Read panel is kept per window while the page is open. | [Prop] | e2e + e2e:routing | — |

### R20 transition table

"Before" is the mode the window had before Read. URL entries are pushed only where it says "push".

| From | Action | To | URL | Focus |
|---|---|---|---|---|
| `/`, window in Demo or Try | Read tab | Read, same size (expanded under 760 px) | push `/p/<id>/` | Read tab |
| Read, not expanded | Expand | Read, expanded | none (same URL) | Restore control |
| Read, expanded (from the sheet) | Restore | Read, not expanded (desktop); before-mode, not expanded (under 760 px) | desktop: none; under 760 px: `history.back()` | Expand control |
| Read (from the sheet) | Demo or Try tab | that mode, same expansion | `history.back()` | the tab |
| Read (from the sheet) | Back | before-mode, not expanded | `/` | the window |
| Any mode, not Read | Expand / Restore | same mode | none | Restore / Expand control |
| Before-mode after Back | Forward | Read, not expanded (expanded under 760 px) | `/p/<id>/` | Read tab |
| Direct entry `/p/<id>/` | page load | Read, expanded | `/p/<id>/` (no push) | Read heading |
| Direct entry | Restore | Read, not expanded, window centred in the view | `replaceState` to `/` | Expand control |
| Direct entry, after Restore | Demo or Try tab | that mode | none (already `/`) | the tab |
| Direct entry | Back | the browser leaves the site (no entry was pushed) | browser | browser |

### Acceptance

- **R1.a** Given the crawler window, when the visitor presses Read, then Read has `aria-selected="true"` and
  `tabindex="0"`, Demo has `aria-selected="false"` and `tabindex="-1"`, the Read panel is `aria-labelledby` the Read
  tab, and the window has not moved.
- **R1.b** Given focus on the Demo tab, when the visitor presses Right, then the next tab is selected and focused. On the last tab, Right goes to the first. Home and End go to the ends. The sheet does not pan.
- **R1.c** Given CastleSiege (one mode), then it has no tab strip and it has an Expand control. Given Paint, then it
  has no Expand control.
- **R2.a** Given the crawler window at zoom 0.6, when the visitor presses Expand, then the window's bounding box
  equals the viewport (±1 px) at 1440 × 900 and 390 × 844, and its content is at scale 1.
- **R2.b** Given an expanded window, when the visitor presses Restore, then the window's sheet position, the zoom and
  the scroll position equal their values before Expand.
- **R3.a** Given Read at 1440 × 900, when the visitor turns the wheel over the Read panel, then the panel scrolls and
  the sheet's scroll position does not change, also at the panel's end.
- **R3.b** Given Read in phone emulation with a touch drag up and down in the panel, then the panel scrolls and the
  sheet does not pan.
- **R3.c** Given focus in the Read panel, when the visitor presses Down, Page Down, End and Space, then the panel
  scrolls and the sheet does not pan, also at the panel's end.
- **R4.a** Given an expanded window, when the visitor presses Tab 50 times and Shift+Tab 50 times, then the focus is
  always inside the window. When the visitor presses Esc, then the window restores and the focus is on the Expand
  control.
- **R4.b** Given expanded CastleSiege with the focus in the game, when the visitor presses Esc, then the window stays
  expanded. When the visitor then presses Tab and Esc, then it restores.
- **R4.c** Given a direct load of `/p/crawler/`, then the focus is on the Read heading. After Restore, the focus is on
  the Expand control.
- **R5.a** Given motion allowed, when the visitor presses Expand, then sampled frames during the first 200 ms show the
  window between its start rectangle and the viewport, and the end state is there by 300 ms.
- **R5.b** Given reduced motion, when the visitor presses Expand, then no frame shows the window at a size between
  its sheet size and the viewport.
- **R5.c** Given an Expand animation under way, when reduced motion turns on, then the next frame shows the end state.
- **R5.d** Given 5 Expand and Restore cycles, then 2 s later no animation-frame callback runs.
- **R6.a** Given the crawler demo running with N rows, when the visitor expands and restores, then the rows continue
  from N, with no restart.
- **R6.b** Given the crawler demo, when the visitor selects Read, then the demo stops adding rows. When the visitor
  selects Demo, then it continues from the same row. Given the tab hidden while expanded, then the demo stops.
- **R7.a** Given an expanded window, when the visitor drags its title bar or turns the wheel, then the sheet and the
  window do not move. After Restore, a drag moves the window.
- **R8.a** Given Read, when the reader scrolls "Challenges" to the top, then the nav item "Challenges" has
  `aria-current="true"`.
- **R8.b** Given the built `/` with both write-ups, then no two elements have the same id.
- **R9.a** Given 390 × 844, then the diagram's `scrollWidth` equals its `clientWidth`.
- **R9.b** Given a diagram file with a box `stage` that is not a tool stage id, or a tool stage id on no box, or two
  boxes with one id, then `npm run build` fails and names the file.
- **R10.a** Given the real 011 tool with a stubbed Worker, when a run reaches the fetch step, then the `fetch` stage
  box has the active class and "running", and no other box has it. When the run ends, no box has it.
- **R10.b** Given the 012 stored result drawing, then the active box says "drawing", and after the last part no box is
  active.
- **R10.c** Given a `tool:stage` start sent before Read opens, when Read opens, then that box is active.
- **R10.d** Given 50 `tool:stage` events in one frame, then 013 updates the diagram once, with the latest state.
- **R10.e** Given `tool:read-open`, then the real 011 and 012 tools each send their current `tool:status` within one
  frame.
- **R11.a** Given a crawler status `offline`, then the `gate-d` box contains "offline". Given an insider status with 3
  waiting, then the status line says 3 requests are waiting. Given no status, then it says "Status not available".
- **R12.a** Given `/p/crawler/` from `npm run preview` and from local `wrangler dev`, then every asset URL answers 200,
  the title is the crawler's, and the window is expanded in Read. Given `/p/crawler` (no slash), then the same page after the
  Worker's trailing-slash redirect. Given `/p/castlesiege/`, then the 404 page with status 404.
- **R13.a** Given JavaScript off, then on `/p/crawler/` each of the six sections is visible by page scroll at 1440 × 900
  and 390 × 844, and on `/` the crawler window has a link to `/p/crawler/`.
- **R14.a** A unit test computes the contrast of every write-up and diagram token pair, including the active outline,
  in both themes, and fails below 001 R18.
- **R15.a** `npm run build` reports the shell and the full budget for `/` and each `/p/<id>/` page within the limits.
- **R16.a** Given request logging from a load of `/` and of `/p/insider/`, through Read, Expand, Restore, the nav and
  Origin, then every request is a site file, the case-studies JSON or the 010 R9 beacon.
- **R17.a** Given a write-up with "Challenges" missing, then `npm run build` fails and names the file.
- **R18.a** Given the insider Read panel, when Origin opens, then the R18 notice comes before the first case study in
  DOM order and contains the email and "7 days", and the case-study container has `data-nosnippet`.
- **R18.b** Given the built `/`, `/p/insider/` and `/p/crawler/` HTML, then no wallet address appears in them, and
  `/p/insider/case-studies.json` answers with `X-Robots-Tag: noindex`.
- **R18.c** Given the JSON request fails, then Origin shows the notice and one sentence that the case studies did not
  load.
- **R18.d** Given the committed tree (`git ls-files`), then a scan for `0x[0-9a-fA-F]{40}`, and, when the private R22 file exists
  locally, for each address prefix and username in it, finds matches only in `content/projects/insider-case-studies.json`.
  The scan runs in `npm test` and before each commit of a C3 ledger entry.
- **R19.a** Given an entry removed from the JSON source, then the built JSON does not contain its address. After the
  deploy, a fetch of `/p/insider/case-studies.json` with `Cache-Control: no-cache` does not contain it (manual).
- **R20.a** Each row of the R20 table is one e2e case: action, then the expected mode, expansion, URL and focus. Back
  and Forward cases run in Chromium and WebKit.

## Event contract (owned by 013)

Events are `CustomEvent`s dispatched on the window's `<section data-win>` node, `bubbles: false`.

| Event | Sender | `detail` | Rules |
|---|---|---|---|
| `tool:stage` | tool | `{ stage: <stage id> \| null, state: "start" \| "done" \| "error", mode: "live" \| "replay", at: <Date.now()> }` | Send on each stage change only (no repeats while a stage runs). `{ stage: null }` (with any `state`) ends the run or draw and clears all. 013 keeps the latest event and draws at most once per frame. |
| `tool:status` | tool | crawler `{ judge: "online" \| "offline" \| "busy", at }`; insider `{ lastRun: <ISO>, nextRun: <ISO>, waiting: <int>, at }` | Send at mount, on each change, and as the answer to `tool:read-open`. At most once per second. 013 keeps the latest. |
| `tool:read-open` | 013 | `{}` | Sent when the Read panel opens. The tool answers with its current `tool:status`, and with its current `tool:stage` if a run or draw is under way. |

**What 011 sends:** `tool:stage` with `mode: "live"` and stages `seeds`, `frontier`, `fetch`, `gate-a`, `gate-b`,
`gate-c`, `gate-d`, `evaluate`, then `{ stage: null }` at run end, stop or failure. `tool:status` with `judge`. It
answers `tool:read-open`.

**What 012 sends:** `tool:stage` with `mode: "replay"` and stages `market`, `prices`, `moves`, `candidates`, `news`,
`score` while a stored result draws (one `start` and one `done` each), then `{ stage: null }`. With reduced motion,
each stage once and then `null` in the same frame. `tool:status` with `lastRun`, `nextRun`, `waiting`. It answers
`tool:read-open`.

## Content plan (the write-ups are written as the builds happen)

Owner, round 2: "We'll write it up based on what we do." So each section has an owner and a source:

| Section | Source | Who writes it, and when |
|---|---|---|
| Overview, Uses | 011/012 spec "Why" and the tool as shipped | Track lead drafts at the track's last task |
| How it works (diagram) | 011/012 Approach and the shipped code | Track lead, the diagram JSON with the tool's stage ids, in the same task that adds `tool:stage` |
| Challenges | The track's **challenges log** (below) | Track lead picks 3 to 5 entries at the end. The owner approves |
| Results | 011's evaluation task, 10 topics × 3 runs (crawler); 012's nightly runs, plus 012 R22's report-case check (insider), published only by the owner's N8 rule | Track lead, from the ledger, with the run date and count |
| Origin | The course repos and report, `writeup-outlines.md` | 013 lead now (draft ready, needs only the owner's check) |

**Challenges log.** Each build track keeps `docs/specs/<track>/challenges.md` from its first task. One entry per real
problem met during the build, written on the day it happens:

```
## YYYY-MM-DD — <short title>
- What happened: <one or two sentences, with the evidence: command, ledger line, commit>
- What we did: <the fix or the decision, and the spec or task id>
- Public: yes / no (no = secrets, the owner's home network, anything private)
```

Examples of what counts (**inferred** from the 011/012 drafts): a Free-plan limit that forced a design change, the
deprecated Goldsky subgraph, a judge model that is too slow on CPU, robots.txt or bot pages that block fetches.

**Content tasks** (to add to 011/012 `tasks.md` and to 013 `tasks.md`):

- **C1** (011, 012, first task): create `challenges.md` with the format above.
- **C2** (011, 012, each task): add an entry when a problem took more than about 30 minutes or changed the plan.
- **C3** (011 eval task; 012 after the first full nightly run and R22): record the results with date, run count,
  models and caps in the ledger. For the insider: counts and listed yes/no per case only. Never copy a wallet address
  or username from 012's private R22 files (`~/.rargu/insider-eval/`) into the ledger, a spec, the write-up or any
  committed file. Refer to a case by its report section (§4.1 to §4.4).
- **C4** (011, 012, last task before deploy): write the write-up body and the diagram JSON. `npm run build` passes R17.
- **C5** (owner): read the write-up in a preview and approve it. It ships with the tool (G-deploy).
- **C6** (013 lead, content-only edit, no spec step needed): change the insider numbers to "333K on-chain fills
  across 6 markets (~$256M volume when collected)" in `content/projects/polymarket-insider-trading.md` (lines 8 and
  17, "226K+ … $240M+") and `content/resume.md:47` (owner, round 3; 012 research §10). Use the same figure in Origin.
- **C7** (013 lead): build `content/projects/insider-case-studies.json` from the report PDF, section 4, with full
  addresses as the report gives them, and the report's hedges word for word.

**Report-case check (N8, critique 17).** 013 does not run its own check. It uses 012 R22's output
(`jobs/insider/eval/report-cases.json`: the report's section 4 wallets over the 5 resolved start markets, full
address, found, listed, score). The publish rule is the owner's (N8, N10): publish all rows if a majority of the
report wallets expected as candidates is listed (with three expected, two or more) and the market maker is not
listed. Else Results leaves the check out. Vivaldi007 bet about 115 h before its spike and the rule looks back 24 h,
so it will likely not be listed (012 finding; owner kept 24 h). A published table is titled "Report cases, checked with the live rule" and lists each wallet with
listed yes/no, so it reads as selected case checks, not as an accuracy figure.

## Risks (insider case studies, Q8)

The owner chose to show the report's case studies as they are. This note lists the risks and mitigations. It does
not change his choice.

- **A wallet owner reads the case study as an accusation.** A real person can be behind a username. **Inferred.**
  Mitigations: the R18 notice directly above the case studies, in the body type size. Keep the report's own hedges
  word for word (for example, it "cannot claim definitive identification"). Never write "insider" without
  "candidate". Date the section.
- **No way to ask for a correction.** Mitigation: the site email with a stated 7-day reply (owner, N3) and the R19
  removal steps. No form, no network call. Removal needs a deploy, so it is not instant.
- **The case studies use the course project's method, not the live points rule.** A reader can mix them up.
  Mitigation: they sit in Origin, under a heading that names the course project and its date.
- **Search engines index wallet addresses.** The `noindex` JSON keeps addresses out of the first HTML only. A search
  engine that runs JavaScript can still see them on the shown page (critique 1). Mitigation: `data-nosnippet`. The owner
  accepts the rest of this risk (N9: load on scroll into view).

## Approach

- **Expand:** move the window's `<section>` into a fixed layer `#lift` (sibling of `#vp`, z-index between the
  minimap's 5000 and the toast's 9999, `src/sheet/sheet.css:337,580`), and back. `position: fixed` in place does not
  work: `#world` has a transform (`src/sheet/view.ts:151`), and so does the window (`src/sheet/windows.ts:96`). A
  placeholder of the same size keeps the window's place in `#world`. FLIP: read `getBoundingClientRect()` before the
  move (it includes zoom and tilt), move, animate from that rect to the viewport. `windows.ts` gets `lift(id)` and
  `drop(id)`: stop the window's flight and tilt, skip it in the loop, save and restore its inline `transform`,
  `transform-origin` and `will-change`.
- **Modes:** each project window gets panels `.demo-area`, `.try-area` and `.read-area`. Only one is not `hidden`.
  011 and 012 own `.try-area`. This spec owns the tab strip, the Read panel, Expand and the event hooks.
  `visibility.ts` gets the panel and expansion inputs (R6).
- **Input:** add `.read-area` to `NOPAN` (`src/sheet/view.ts:22`). The `#vp` keydown handler ignores keys whose target
  is in `.read-area` (`src/sheet/view.ts:406`). The dialog's Esc handler runs in the capture phase and checks R4's
  exceptions first.
- **Content:** the markdown body of `content/projects/<file>.md`, rendered at build with `renderMarkdown`
  (`src/apps/resume/doc.ts:82`) and an id prefix option (R8). New frontmatter fields: `writeup: true`, `role`,
  `lede`. The bold claim sentence is plain markdown (`**…**`). The build puts the diagram after the "How it works" H2.
  `scripts/sheet-content.ts` already fails the build on bad frontmatter (lines 58-60). The R17 checks use the same
  rule.
- **Diagram:** HTML tiers from a JSON file (R9 schema), following the reference (thin borders, a mono label, a name,
  a keyword line). The sheet's look: 2 px `var(--outline)`, Pixel Operator labels, numbered tiers. Text arrows (↓)
  between tiers and labelled loops. CSS grid wraps a wide tier to 2 × 2 at narrow widths.
- **`/p/` pages:** after `vite build`, a script copies `dist/index.html` to `dist/p/<id>/index.html` for each write-up,
  sets the head and `data-open`, and rewrites `./` asset URLs to `/`. The sheet guard runs on all of them.
- **Case studies JSON:** `content/projects/insider-case-studies.json`, copied to `dist/p/insider/case-studies.json` at
  build. 011 owns `public/_headers`. 013's task adds only the lines for this path: `X-Robots-Tag: noindex` and
  `Cache-Control: public, max-age=300`. The Read panel fetches it (same origin) when Origin first scrolls into view.
- **Section nav:** an `IntersectionObserver` scroll spy (no animation frame while idle, 001 R22).
- **Rejected:**
  - A second diagram for the course project. The write-up is about the new build.
  - A standalone `/p/` page like `scripts/build-resume-html.ts` (critique 7): the sheet cannot start without `#vp`,
    `#world`, the card and every window.
  - A separate overlay that copies the write-up (two copies of the tool state, and the owner asked for the window to
    grow).
  - Browser Fullscreen API (owner said no, and iPhone Safari does not support it for elements).
  - Hand-drawn SVG diagrams (do not reflow at 390 px). Mermaid (large dependency, run-time render).
  - Paged sections (hides the length, weak for search). A hash link (no own title for sharing or search).
  - The Read panel on `/` without JavaScript: the window clips it (R13).

## Boundaries

- **Always:** keep the site static. Respect reduced motion. Say "candidates, not proof" next to every insider wallet.
  Credit the teams in Origin (Harry and the WSEProject team; Shwetanshu Raj with his GitHub link). Keep course-project
  facts in Origin and live-build facts in the other sections.
- **Ask first:** images or charts in a write-up (Q7 says none). Any change to `public/_redirects`. Any `public/_headers`
  change beyond the R18 rule. Any change to the case study text beyond the report's words. Publishing a
  challenges-log entry marked "Public: no".
- **Never:** call a third-party service from Read or a `/p/` page. Put write-up text in the JS bundle. Copy the text
  or design of the reference site. Publish a result that is not from a recorded run (ledger) or the course report.
  Put the spare computer's hostname, home network details or secrets in a write-up. Put a wallet address in static
  HTML. Copy a wallet address or username from 012's private R22 files (`~/.rargu/insider-eval/`) into the ledger or
  any committed file. Only `content/projects/insider-case-studies.json` (served with `noindex`) carries addresses.

## Out of scope

- The live tools (011, 012), their hosting, the Tunnel and the nightly job.
- Write-up content for CastleSiege, Castle Wars and Pentimento. The mechanism supports them.
- Expand and Read for the Quick tools (Paint, Music, Notes). (Owner, Q6.)

## Dependencies on 011 and 012

1. **Panel:** the tool mounts in the window's `.try-area` only, and does not change `.demo-area` or the title bar.
2. **No iframe** (assumption 8). If a tool must use one, it reloads on Expand, and R6 fails for it.
3. **Events:** exactly as the Event contract above (013 owns it).
4. **Esc:** a tool control that uses Esc calls `preventDefault()` (R4).
5. **Size:** the tool lays out at the window's sheet size and at full viewport (`ResizeObserver`, no reload).
6. **Hidden:** when the tool's panel is not visible (R6), it stops animation. It decides itself whether a run goes on.
7. **Content tasks C1 to C4** in each track's `tasks.md`, and an evaluation task in 011 (owner, round 2).
8. **Ship together:** `writeup: true` goes in the same release as the tool (R17).
9. **Insider tabs (owner, N6):** 012 R17 removes the 006 simulated demo. The insider window has Try and Read only.
   Try opens first, on the Maduro market (Gamma `916440`, 012 R1).
10. **Wording and data (012):** "Insider candidates". The live tool refreshes the still-open market ("China invades
    Taiwan") each night. Only 2 of the 3 markets that were open at the end of the course project have resolved.
11. **Report-case check:** 012 R22's JSON output with full addresses (Report-case check, above).

## Open questions

- N5 to N8: closed by the owner, round 3 (table above).
- N9, N10: closed by the owner, round 4 (table above).
- TODO-owner: Harry's full name and link. May the write-up name the 2018 MacBook Pro? The year line. (Details in
  `writeup-outlines.md`.)

## Approval record

2026-10-26 — **Owner approved this spec** ("Approve all three, go ahead"), together with 011, 012 and 013, including the owner answers recorded above. Two owner rules added with the approval: (1) teammates are named only by their GitHub usernames (no full names) in site text, write-ups, READMEs and zips; (2) the write-ups and site text never mention the owner's 2018 MacBook Pro (say "a home machine" or name nothing; internal docs and runbooks may name it). Assumed, not yet confirmed: `OWNER_TZ` = `America/New_York`. Open content item: the year line. No gate is approved by this (G-net, G-deploy, G-push, new dependencies stay ask-first).

2026-10-26 — Design answers given by the owner through the orchestrator in four rounds (tables above). Codex
critique done the same day ([critique](../../review/spec-013-critique-codex.md), 17 findings: 13 accepted (5 of them
in part, the rest cross-spec or NEEDS OWNER), 4 cross-spec only). The spec is Critiqued, not Approved: it needs the owner's approval of the whole text. No gate is
approved.
