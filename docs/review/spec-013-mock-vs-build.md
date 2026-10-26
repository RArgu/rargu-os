# Spec 013: mock vs build

## Pass 1 (2026-10-26)

- **Compared:** mock `docs/mockups/rargu-os-v0.7.html` (SHA-256 `03552b06…f340`, matches `docs/mockups/README.md`)
  with the e2e build of branch `spec-013-window` (fixture write-ups for the crawler and insider windows), served by
  `vite preview`. Chromium (Playwright), device scale 2. Viewports 1440 × 900 and 390 × 844, light and dark.
- **Views:** the start view (mock and build, `shot.mjs`); build only (no mock counterpart, spec 013): the crawler
  Read panel in its window, `/p/crawler/` expanded, its diagram, `/p/insider/` Origin with the case studies.
- Images are in the session scratchpad (`shots/pairs`, `shots/only2`), not in the repo.

### Differences in the start view

| ID | Difference | Reason |
|---|---|---|
| L1 | Each project title bar has an Expand control (⤢) before Home | Spec 013 R2 |
| L2 | Crawler and insider title bars have Demo and Read tabs | Spec 013 R1; in this build only because of the e2e fixture write-ups. Production shows them when a write-up or tool ships (R17) |
| — | CastleSiege runs the real game, the card text, phone start zoom 58 % | Earlier specs (003, 007, 001 R15); not 013 |

### Build-only views (spec 013)

| ID | Finding | Result |
|---|---|---|
| D1 | Dark theme: diagram box borders, the nav underline and the notice border used `--outline` (#000000) on `--win-bg` (#1d2b53), under R14's 3:1 | **Defect, fixed in this pass**: lines use `--ink`; unit guard in `tests/unit/sheet-content.test.ts`. Re-shot: visible in both themes |
| D2 | `/p/insider/` after a jump to Origin: the nav marked Results once the case studies made the panel longer | **Defect, fixed**: the nav also re-marks when the panel's content changes size (`read.ts`) |
| L3 | The tab strip and Expand make the crawler title bar text shorter (ellipsis at 390 px) | Spec 013 R1, R2; title text keeps its ellipsis |

### Matches the spec

- Read in the window: title block, lede, chips, sticky chip nav, 68 ch text (R8). Expanded at 1440: nav in a left
  column (R8). Phone: nav chips in one sideways row, 16 px gutters, the four-gate tier in 2 columns (R9).
- The diagram: tiers, arrows, loop line, note, caption, token colours (R9). Notice above the case studies (R18).

### Limits

Motion (FLIP, reduced motion) was judged by the e2e tests, not by eye. Firefox and WebKit were not screenshotted
(their e2e passed). Touch was tested in e2e only. Text is fixture text; real write-ups come with 011/012 (T15, T16).
No owner review of this list yet: per the skill, fixes D1 and D2 are small token and behaviour defects against
R14 and R8, so they were fixed before showing.
