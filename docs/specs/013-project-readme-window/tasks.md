# 013 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (`ponytail`), then run `npm run lint`, `npm test` and the named e2e.

Tags: **[local]** builds and verifies on this machine with no gate. **[G-deploy]** needs the owner's OK to deploy.
**[new-dep]** adds a dependency (ask first). **[owner-content]** needs text or a check from the owner. No task needs
a new dependency: the scroll spy, tabs, FLIP and loaders use browser APIs only.

T1 to T13 build the window mechanism now, without 011/012. Until a write-up has `writeup: true`, the site shows no
Read tab, so T1 to T13 can merge with no visible change. e2e tests use a fixture write-up and a fixture tool that
exist only in the e2e build (`vite build --mode e2e`, as 002 T3 does for fixture apps). The Try tab stays hidden until
a tool registers.

## Mechanism (buildable now)

- [x] **T1** Write-up content pipeline [local] (R8, R17)
  - Acceptance: `loadProjects` reads `writeup`, `role` and `lede` and the markdown body. `renderMarkdown` takes an
    id prefix (`crawler-sec-…`). With `writeup: true`, the build fails and names the file when: an R8 H2 is missing
    or out of order, a section has no bold claim sentence, the role line is missing, Results has no date and run
    count, Origin has no credit line, or the shown text has `TODO`. A fixture write-up for the e2e build passes.
  - Verify: `npm test` (R17.a; one case per rule; R8.b id uniqueness across two fixture write-ups).
  - Files: `scripts/sheet-content.ts`, `src/apps/resume/doc.ts`, `tests/unit/writeup-content.test.ts`,
    `tests/fixtures/content/` (fixture write-up).
- [x] **T2** Diagram schema and HTML renderer [local] (R9, R14)
  - Acceptance: a JSON file with the R9 schema renders tiers, boxes, arrows and labelled loops as HTML with token
    colours only. The build fails on a bad `stage`, a tool stage on no box, a duplicate id or a bad `loop.to`.
    Contrast of every diagram token pair, including the active outline and markers, meets 001 R18 in both themes.
  - Verify: `npm test` (R9.b, R14.a). `npm run e2e` (R9.a: no sideways scroll at 390 × 844, fixture diagram).
  - Files: `scripts/diagram.ts`, `src/sheet/readme.css`, `tests/unit/diagram.test.ts`,
    `tests/unit/sheet-contrast.test.ts`, `tests/e2e/readme.spec.ts`.
- [x] **T3** Tab strip and panels [local] (R1)
  - Acceptance: every project window gets `.demo-area`, `.try-area`, `.read-area` panels and an ARIA tab strip
    (names, `aria-controls`, `aria-labelledby`, roving `tabindex`, Left/Right wrap, Home/End). A tab shows only when
    its mode exists. One mode means no strip. `registerTool(id)` adds the Try tab. Pressing or arrowing a tab does
    not drag the window or pan the sheet. Quick tools are unchanged.
  - Verify: `npm run e2e` (R1.a, R1.b, R1.c; fixture tool for the Try tab).
  - Files: `scripts/sheet-content.ts`, `src/sheet/tabs.ts`, `src/sheet/main.ts`, `src/sheet/sheet.css`,
    `tests/e2e/readme-tabs.spec.ts`.
- [x] **T4** Read panel: layout, input and section nav [local] (R3, R8)
  - Acceptance: the Read panel scrolls inside the window. Wheel, touch (`touch-action: pan-y`, in `NOPAN`) and keys
    (arrows, Page, Home/End, Space) scroll the panel and never pan the sheet, also at its ends. The nav marks the
    current section with `aria-current`. Layout as R8 at 1440 × 900 and 390 × 844.
  - Verify: `npm run e2e` (R3.a, R3.b, R3.c, R8.a).
  - Files: `src/sheet/read.ts`, `src/sheet/view.ts`, `src/sheet/readme.css`, `tests/e2e/readme.spec.ts`.
- [x] **T5** Visibility uses the panel and expansion [local] (R6)
  - Acceptance: visible = tab visible and (expanded or in view) and panel selected. Selecting Read stops the demo's
    animation, and selecting Demo continues it from the same state. A Try run is never cancelled by a tab change.
  - Verify: `npm run e2e` (R6.b). Existing `npm run e2e` demo tests still pass.
  - Files: `src/sheet/demos/visibility.ts`, `src/sheet/main.ts`, `tests/e2e/readme-tabs.spec.ts`.
- [x] **T6** Expand and Restore [local] (R2, R5, R6, R7)
  - Acceptance: Expand moves the window node into `#lift` with a placeholder, FLIP 240 ms ± 20, and Restore returns
    it to the same sheet position, zoom and scroll. Reduced motion: fade ≤ 120 ms, no size between. A preference
    change mid-animation ends at the end state. No drag, throw, Home, pan or zoom while expanded. Demo state is kept.
    Quick tools have no Expand control. No animation frame 2 s after 5 cycles.
  - Verify: `npm run e2e` (R2.a, R2.b, R5.a–d, R6.a, R7.a); `npm run e2e:all` for WebKit and Firefox.
  - Files: `src/sheet/expand.ts`, `src/sheet/windows.ts`, `index.html`, `src/sheet/sheet.css`,
    `tests/e2e/readme-expand.spec.ts`.
- [x] **T7** Modal dialog and focus [local] (R4)
  - Acceptance: expanded = `role="dialog"`, `aria-modal`, labelled. Sheet, card, minimap and zoom are `inert`. Tab and
    Shift+Tab stay inside. A capture-phase Esc restores, except in a Try or hosted-app area (002's Esc then Tab rule)
    or after `preventDefault()`. Focus after Restore goes to the Expand control.
  - Verify: `npm run e2e` (R4.a, R4.b with expanded CastleSiege, R4.c after T9).
  - Files: `src/sheet/expand.ts`, `src/sheet/main.ts`, `tests/e2e/readme-expand.spec.ts`.
- [ ] **T8** Event contract [local] (R10, R11)
  - Acceptance: 013 listens for `tool:stage` and `tool:status` on each window from page start, keeps the latest of
    each, draws at most once per frame, and sends `tool:read-open` when Read opens. One active box (latest `start`),
    cleared by `done`, `error` ("stopped") or `null`. Markers "running" / "drawing", announced once. Status texts as
    R11, "busy" plain, "Status not available" with no insider status.
  - Verify: `npm run e2e` (R10.c, R10.d, R11.a with the fixture tool). R10.a, R10.b, R10.e run in T15/T16 with the
    real tools.
  - Files: `src/sheet/tool-events.ts`, `src/sheet/read.ts`, `src/sheet/readme.css`,
    `tests/fixtures/tool-fixture.ts`, `tests/e2e/readme-events.spec.ts`.
- [ ] **T9** `/p/<id>/` pages [local] (R12, R15)
  - Acceptance: after `vite build`, a script writes `dist/p/<id>/index.html` for each write-up from `dist/index.html`
    with its own title, description, canonical and preview tags, `data-open="<id>:read"`, and absolute asset URLs.
    With JavaScript, the page starts with the window expanded in Read. The sheet guard checks each page: assets
    resolve, shell ≤ 100 KiB and total ≤ 150 KiB gzip. A project with no write-up has no page (404).
  - Verify: `npm run build` (R15.a). `npm run e2e:routing` against local `wrangler dev` (R12.a: 200 assets, title,
    trailing-slash redirect, 404). `npm run e2e` (R4.c).
  - Files: `scripts/build-p-pages.ts`, `package.json` (build script), `scripts/sheet-guard.ts`, `src/sheet/main.ts`,
    `tests/e2e/routing-p-pages.spec.ts`.
- [ ] **T10** History transitions [local] (R20)
  - Acceptance: every row of the R20 table gives the stated mode, expansion, URL and focus, including Back and
    Forward and direct entry.
  - Verify: `npm run e2e` (R20.a, one case per row); `npm run e2e:all` for the Back/Forward cases in WebKit.
  - Files: `src/sheet/history.ts`, `src/sheet/main.ts`, `tests/e2e/readme-history.spec.ts`.
- [ ] **T11** Without JavaScript [local] (R13)
  - Acceptance: on `/p/<id>/`, CSS keyed on `data-open` shows the write-up as a normal page with every section
    visible by page scroll. On `/`, a window with a write-up shows a "Read the write-up" link to `/p/<id>/`.
  - Verify: `npm run e2e` with JavaScript off (R13.a at 1440 × 900 and 390 × 844).
  - Files: `scripts/sheet-content.ts`, `src/sheet/readme.css`, `tests/e2e/readme-nojs.spec.ts`.
- [ ] **T12** Case-study loader and address guard [local] (R16, R18, R19)
  - Acceptance: the build copies `content/projects/insider-case-studies.json` to `dist/p/insider/case-studies.json`.
    013 adds its two lines to `public/_headers` (011 owns the file): `X-Robots-Tag: noindex`, `Cache-Control: public,
    max-age=300`. Origin loads the JSON once when it first scrolls into view, into a `data-nosnippet` container, below
    the static notice (both removal times, 7 days, copies cannot be recalled). A failed load keeps the notice and says
    so. No wallet address in any built HTML. The R18.d scan runs in `npm test`. Uses a fixture JSON until T14.
  - Verify: `npm test` (R18.d, R19.a). `npm run e2e` (R18.a, R18.b, R18.c, R16.a).
  - Files: `scripts/build-p-pages.ts`, `public/_headers`, `src/sheet/case-studies.ts`,
    `tests/unit/address-scan.test.ts`, `tests/e2e/readme-case-studies.spec.ts`.
- [ ] **T13** Mechanism check before review [local] (R5, R8, R14, R15, R16)
  - Acceptance: all 013 e2e pass in `npm run e2e:all`. `compare-vs-mock` for a window with the fixture write-up
    (Read in the window and expanded, 1440 × 900 and 390 × 844, light and dark) lists only differences from 013. The
    session ledger records the commands and results.
  - Verify: `npm run lint`, `npm test`, `npm run e2e:all`, `npm run build`, `compare-vs-mock`.
  - Files: `docs/ledger/<session>.md`.

## Content (with the owner and 011/012)

- [ ] **T14** Insider numbers and case-study JSON [owner-content] (R18, R19; content tasks C6, C7)
  - Acceptance: "333K on-chain fills across 6 markets (~$256M volume when collected)" in
    `content/projects/polymarket-insider-trading.md` (lines 8 and 17) and `content/resume.md:47`. The case-study JSON
    holds the report's section 4 case studies word for word, with its hedges. The owner checks the JSON against the
    report.
  - Verify: `npm test` (R18.d scan finds addresses only in the JSON). Owner check in a preview.
  - Files: `content/projects/polymarket-insider-trading.md`, `content/resume.md`,
    `content/projects/insider-case-studies.json`.
- [ ] **T15** Crawler write-up and diagram (after 011 C4) [owner-content] (R8, R9, R10, R17)
  - Acceptance: the crawler body has the six sections from 011's `challenges.md` and evaluation (10 topics × 3 runs,
    HTML table), Origin with credit by GitHub username only, no machine model. The frontmatter `year` becomes "2025, live 2026"
    (owner), in the same release as the tool, so the sheet and `/p/crawler/` show it only once the tool ships. The
    diagram JSON uses 011's stage ids. `writeup: true` is set in the same branch as 011's tool. With the real tool
    and a stubbed Worker, R10.a and R10.e pass.
  - Verify: `npm run build` (R17 checks). `npm run e2e` (R10.a, R10.e). Owner reads it in `npm run preview` (C5).
  - Files: `content/projects/focused-web-crawler.md`, `content/projects/diagrams/focused-web-crawler.json`,
    `tests/e2e/readme-events.spec.ts`.
- [ ] **T16** Insider write-up and diagram (after 012 C4) [owner-content] (R8, R9, R10, R17, R18)
  - Acceptance: the insider body has the six sections from 012's `challenges.md` and runs, the report-case table only
    if the N10 rule passes (a majority of expected wallets listed, the market maker not listed), Origin with
    `shwetanshu07` and the case-study notice. The frontmatter `year` becomes "2026, live 2026" (owner), in the same
    release as the tool. The diagram JSON uses 012's stage ids. The insider window has Try and
    Read only, Try first on Maduro. R10.b and R10.e pass with the real tool.
  - Verify: `npm run build`, `npm run e2e` (R10.b, R10.e, R18.a). Owner reads it in a preview (C5).
  - Files: `content/projects/polymarket-insider-trading.md`,
    `content/projects/diagrams/polymarket-insider-trading.json`, `tests/e2e/readme-events.spec.ts`.
- [ ] **T17** Ship with the tools [G-deploy] (R12, R16, R19)
  - Acceptance: each write-up deploys in the same release as its tool, after the owner's OK. After the deploy:
    `/p/crawler/` and `/p/insider/` answer 200 with their own titles, the case-study JSON answers with `noindex`, and
    the only third-party request is the 010 R9 beacon (plus 011/012's approved origins in Try).
  - Verify: `npm run deploy` (owner OK), then `npm run e2e:routing` against rargu.dev and a manual check of the
    headers. Ledger entry with the Worker version id and the rollback id.
  - Files: `docs/ledger/<session>.md`, `docs/specs/013-project-readme-window/spec.md` (status).
