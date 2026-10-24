# Spec 007: mock vs build (compare-vs-mock)

Task T9 (R8). Shot by a subagent with Playwright. Draft for the lead agent. Nothing fixed.

## Pass 1 — 2026-10-24

### Result

- **No new defect.** Every difference has a reason from 001–006, 004, the 007 spec, or the mock README.
- The switch changed what it should: the sheet is at `/`, `/next` answers 301 to `/`, the tab title is
  "Rodrigo Arguello · RArgu OS". Window positions and sizes are the same as in the 003–006 passes.
- Two items for the owner, not defects: the 404 page keeps the old OS look (O1), and the phone card marks a different
  project when it opens (O2).

### What was compared

- Mock: `docs/mockups/rargu-os-v0.7.html`, SHA-256
  `03552b06b352ddde27c35d5a4415e4f3c4012dc7a30fbb19c3209ce8b640f340` (observed: `shasum -a 256`; matches
  `docs/mockups/README.md`).
- Build: branch `spec-007-switchover`, HEAD `580165c` plus the staged switch in the index (no unstaged changes,
  observed: `git status --short`). Production build: `npm run build -- --outDir <scratchpad>/t9/dist --emptyOutDir`
  (exit 0). Sheet shots from `npx vite preview` on port 4212, page `/`. Routing and 404 from a local
  `wrangler dev --local` of the same `dist/` on port 4212 (temporary config with the `assets` block of
  `wrangler.jsonc`).
- Browser: Playwright 1.63.0 Chromium, device scale 2. 1440 × 900 and 390 × 844, light and dark. Phone: build with
  `isMobile` and touch, mock with touch only (as in 001–006).
- Views, in this order in one page per viewport and theme: start view; phone only, card open; each window through
  its card link (CastleSiege, Castle Wars, Pentimento, crawler, insider, then the Paint, Music, Notes icons); after
  Reset. On the phone the card toggle is pressed first. The mock's phone links pan before they close the card
  (`docs/mockups/rargu-os-src/part2.js:145,148`), so the script then runs `closeRail(); panTo(id, true)` (mock only,
  as in 004 and 006).
- Settle: window rectangles, scroll and zoom unchanged for 400 ms (rAF poll, 10 s cap). The build views also wait for
  the app title (Paint/Music/Notes), Play enabled (Music), the CastleSiege app root and the Castle Wars canvas. No
  fixed sleeps.
- Files (scratchpad, not in the repo), under
  `/private/tmp/claude-501/-Users-rargu-DevPageOS/b81c6efd-42bc-45ec-a9da-3b8c4826f76b/scratchpad/t9/`:
  `shoot.mjs`, `route.mjs`; shots in `mock/`, `build/`; pairs (mock left, build right, `pair.py`) in `pairs/`
  (`<viewport>[-dark]-{start,card,go-<window>,win-<window>,reset}.png`); logs `mock/log.json`, `build/log.json`;
  404 shots in `route/`.
- No console error or page error in any run. No third-party request from the build (observed: `errors: []`,
  `external: []` in `build/log.json`). The mock loaded Google Fonts (mock only).

### Measured positions, 1440 × 900 (observed, `log.json`; same in light and dark)

Screen x, y and sheet w × h after the card link.

| Window | Mock v0.7 | Build | Earlier pass with the same build value |
|---|---|---|---|
| CastleSiege | 360, 100, 620 × 658 | 562, 124, 620 × 654 | 003 L3, L7 (h 654 after 003 D1 fix) |
| Castle Wars | 572, 140, 600 × 522.3 | 572, 164, 600 × 522 | 005 L2 |
| Pentimento | 572, 80, 600 × 541.8 | 572, 104, 600 × 635 | 005 L2, J5 |
| crawler | 400, 206, 680 × 495.7 | 532, 193, 680 × 522 | 006 L3, L4 |
| insider | 532, 198, 680 × 511 | 532, 178, 680 × 551 | 006 L3, L5 |
| Paint | 655, 279, 434 × 350 | 655, 279, 434 × 350 | 004 (equal) |
| Music | 840, 280, 556 × 348 | 840, 280, 556 × 348 | 004 (equal) |
| Notes | 660, 410, 424 × 364 | 660, 410, 424 × 364 | 004 (equal) |

- Start and Reset: zoom 100 %, same screen as the mock (build scroll 320, 24 with the inset scrolled off, 001 J6).
- 390 × 844 (build zoom 0.5774, shown "58%"): CastleSiege 15.9, 85.4; Castle Wars 21.5, 85.5; Pentimento 22.2, 85.9;
  crawler 16, 393.3; insider 15.8, 358.6; Paint 69.6, 335.5; Music 43.8, 300.9; Notes 72.6, 560.7. Each equals the
  004/005/006 build values (004 `log.json`; 006 `t6-006/build/log.json`: crawler 16, 393; insider 16, 359) (observed).
  Start and Reset views are identical (scroll 192, 42).

### Differences

Layout and order first. Reasons from earlier passes are cited, not repeated.

| ID | View | Difference | Reason |
|---|---|---|---|
| L1 | 390 × 844, all windows | Build at 58 % zoom, mock at 100 % (mock windows cut at the right edge). | 001 J4 / R15; known mock defect (`docs/mockups/README.md`). |
| L2 | 390 × 844, crawler and insider | 680 px windows are 392.6 px wide at 58 %: right edge past the screen. | 006 D1 → owner item O1; owner decision 2026-10-24 ("assume we'll switch to landscape", 004 D1). |
| L3 | 390 × 844, crawler, insider, Notes | The view stops at the sheet's bottom edge (scroll y 173 = max), so these windows sit low (crawler y 393, insider 359, Notes 561, Notes under the map). Mock windows sit at y 140–354. | Same values as 004 and 006 (above). 004 D1, deferred by the owner decision 2026-10-24. |
| L4 | 1440 × 900, all windows | Screen positions differ from the mock as in the table. | 001 J6 (desktop insets), 003 L7, 005 L2, 006 L3. |
| L5 | All, window heights | CastleSiege 654 (mock 658), Pentimento 635 (542), crawler 522 (496), insider 551 (511). | 003 T1/D1, 005 J5, 006 L4/L5; `docs/mockups/README.md` v0.7 row. |
| L6 | All, card | Card 790.6 px tall at 1440 × 900 (mock 773.9): Quick tools labels sit under the icons in the pixel font. | Known mock defect (`docs/mockups/README.md`), 001 J3/J9, 004 L5. |
| L7 | All, window contents | Real CastleSiege, Paint, Tracker, Writer; Castle Wars sprites with Pause and unit line; Pentimento five-line panel and disclaimer; seeded crawler and insider data, notes, Replay/Pause buttons. | 003 L1–L6, 004 L1/L2, 005 J1–J6, 006 J1–J10 (real app or data replaced a stand-in, spec-allowed text). |
| J1 | All, card | Role "Software Engineer" (mock adds "· New York"); tagline from `identity.json`. | 001 L2. |
| J2 | All, card | Project list now shows the short names "Focused Crawler", "Insider Trading" (as the mock). 001 L1 (full titles wrap) no longer applies. | Matches the mock. Not a difference. |
| J3 | All, windows | Window titles differ: "Generalized Focused Web Crawler", "Insider Trading Detection on Polymarket"; "Paint - untitled", "Music - demo.trk", "Notes - untitled" (mock "quick paint", "music maker", "notes.txt"). | 006 L1/L2 (001 R14); 004 J1 (004 R1). |
| J4 | All, title bars | Home ⌂ button on each window. | 001 R9. |
| J5 | Dark | Real apps keep their own dark surfaces (black CastleSiege move list, black Tracker grid, Paint dark checker). | 003 D2 (lead: app night theme, 002 R14); 004 J3. |
| J6 | All, card | Resume link `href="/resume"` (mock `https://rargu.dev/resume`), `target="_blank"` in both. GitHub and LinkedIn equal. | Same page on rargu.dev (derived: `/resume` answers 200 on the local wrangler). Unchanged by 007 (`scripts/sheet-content.ts:154` not in the staged diff). |
| J7 | Tab | Title "Rodrigo Arguello · RArgu OS" (mock "RArgu OS"). Description is the `identity.json` tagline; canonical and `og:*` tags point at `https://rargu.dev/`. | 007 R6 (observed: `page.title()`, meta tags in `build/log.json`). |
| J8 | Address | The build is at `/`; the mock is a file. | 007 R5. |
| O2 | 390 × 844, card open | On the start view, opening the card moves the list mark to "Focused Crawler"; the mock keeps "CastleSiege". | Build re-marks when the card opens (`src/sheet/main.ts:37`), with the area below the open card (`src/sheet/view.ts:482-506`). The mock marks only on scroll (`part2.js:172-175`). Spec text 001 R12.b (nearest to the view centre). Same cause as 001 J8. Listed for the owner, not a defect. |
| J9 | Phone, start vs Reset | Mock start and Reset differ by 14 px; build start and Reset are identical. | 004 J5 (mock behaviour). |

### Switch checks (observed, local wrangler of the same `dist/`, `curl` and Playwright)

| Request | Result |
|---|---|
| `/` | 200, title "Rodrigo Arguello · RArgu OS" |
| `/next`, `/next.html`, `/next/` | 301 to `/`; a browser on `/next` lands on `/` with the sheet title |
| `/index.html` | 307 to `/` |
| `/resume` | 200 |
| `/resume.html` | 307 to `/resume` |
| `/nope` | 404, `404.html`: links "Open RArgu OS" → `/`, "read the resume" → `/resume` |
| `dist/` text search for "DevPageOS" | no match (`grep -ril devpageos`) |

**O1 — 404 page look (owner item, not a defect).** The 404 page keeps the old OS look: navy `rgb(29,43,83)` in light
and dark, Pixel Operator 24 px, yellow "404", blue links (shots `route/*-404.png`). The sheet is grid paper in light
and navy in dark, with Instrument Sans body text. The tab title is "Not found · rargu.dev". 007 R6 asks only for the
links (met). The mock has no 404 page. Only the text changed in 007 (`git diff --cached public/404.html`). Owner to
decide if the 404 page should match the sheet.

### What matches

- (a) Card, eight windows, zoom bar and minimap exist in both, in the same order.
- (b) Grouping: same card sections and window parts.
- (c) Desktop start and Reset views equal the mock's first screen. Every card link centres its window beside the card
  at the same place as in the 003–006 passes. Quick tools land at the mock's exact screen positions.
- (d)–(f) Title bars, fonts, colours, shadows, badges, grid paper and minimap as in the 001–006 passes, by eye.
- (g) Hint text, button labels, project list names and tags equal the mock.

### Limits

- Chromium only. Firefox and WebKit not shot.
- Touch, drag, throw, zoom and other motion not judged by hand. Reduced motion not shot.
- Phone pairs are at different zooms (build 58 %, mock 100 %), compared by eye and DOM numbers.
- The mock phone run had no `isMobile` and used the mock-only `closeRail(); panTo(id, true)` step.
- Sizes from DOM; colours by eye except where named.
- `vite preview` served the sheet shots. The local wrangler served the routing and 404 checks. The live site was
  not checked (R11).
