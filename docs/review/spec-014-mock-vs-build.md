# Spec 014: mock vs build

## Pass 1 (2026-10-26)

- **Compared:** mock `docs/mockups/rargu-os-v0.8.html` (SHA-256 `f8895efd…d883`, as in `docs/mockups/README.md`) with
  the production build (`npm run build`, `vite preview`) of branch `spec-014-chips` at `3ea67e7`. Chromium
  (Playwright), device scale 2, 1440 × 900 and 390 × 844, light and dark, start view (`shot.mjs`, `pair.py`).
  Images in the session scratchpad (`s14/`), not in the repo.

| ID | Difference | Reason |
|---|---|---|
| — | Chip colours: the same in mock and build, both themes (by eye; exact values are e2e-tested in `stack-chips-checks.ts`) | Matches (014 R4, R11) |
| L1 | CastleSiege shows nine chips in the build; the mock shows six (its chip list is an older stand-in: no Web Workers, Fly.io, Docker) | Content (`content/projects/castlesiege.md`, 014 R10); the mock's other chip lists are stand-ins too. Not a 014 change |
| L2 | Expand controls in the title bars | Spec 013 R2 |
| — | Real CastleSiege app, card text, phone start zoom | Earlier specs (003, 007, 001 R15) |

No defect found. Limits: Firefox and WebKit were not screenshotted (their e2e passed); chip colours compared by eye
here, by value in e2e; motion is not involved.

### Owner review

2026-10-26 — The owner approved the preview ("Preview approved, looks good"), relayed by the orchestrator. This covers
the comparison against v0.8 above. No gate is approved by this.
