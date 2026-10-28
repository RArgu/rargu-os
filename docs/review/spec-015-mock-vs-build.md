# Spec 015: mock vs build

## Pass 1 (2026-10-28)

- **Compared:** mock `docs/mockups/rargu-os-v0.8.html` (SHA-256 `6dfac7b9…059b`, as in `docs/mockups/README.md`) with
  the production build (`npm run build`, `vite preview --port 4190`) of branch `release-015` at `b7e2a40`. Chromium
  (Playwright), device scale 2. Start view at 1440 × 900, 1024 × 700 and 390 × 844, light and dark (`shot.mjs`,
  `pair.py`). Also: the Notes window at 1440 × 900 (light and dark; the mock has no Notes window), and the phone
  `about` menu open at 390 × 844 (light and dark). Images in the session scratchpad (`s15/`), not in the repo. The
  mock loaded Google Fonts (mock only), as in earlier passes.

| ID | Difference | Reason |
|---|---|---|
| J1 | Desktop panel is about half the size: no name, title or tagline; no `On this sheet` heading; no drag hint | Owner decision (015 R1, R2, R5; answers 1, 3) |
| J2 | Resume, GitHub and LinkedIn are small buttons on one row; `Email` is a button on its own line; no address text and no `copy` button | Owner decision (015 R3, R4; answer 4) |
| J3 | Shorter window descriptions (two lines); CastleSiege, Pentimento, Crawler and Insider windows 23 px shorter | Owner decision (015 R6; answer 5) |
| J4 | Notes window is yellow in light and dark (body, title bar, menu and status bar) | Owner decision (015 R7; answer 6) |
| J5 | Phone `about` menu: no name, title, tagline, address, `copy` or drag hint; `Email` on its own line | Owner decision (015 R1, R3, R4, R5) |
| L1 | Real CastleSiege app, Expand controls, chip lists, phone start zoom, crawler demo numbers | Earlier specs (003, 013, 014, 001 R15); the crawler numbers are random per load |

No defect found. Checked by command: `node scripts/check-no-email.ts dist README.md` prints `clean` on this build.

Limits: Firefox and WebKit were not screenshotted (their e2e passed: `CI=1 npm run e2e:all`, 1,151 passed, 21
skipped). The hidden title block is off the start view, so it was checked by e2e, not by eye. Sizes judged by eye. No motion change in this spec.

## Pass 2 (2026-10-28, after the Codex fixes)

- **Compared:** the Notes window only (the one view the fixes changed), production build of `release-015` with the
  uncommitted fixes, 1440 × 900, light and dark, Chromium.
- Codex #8: the status bar is now the body yellow `#fff3a8` with dim text, in both themes (by eye; values checked by
  the `panel-trim` R7 e2e). Nothing else in the window changed.
