# 001 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e.

- [x] **T1** Entry page and build guards (R1, R2, R22)
  - Acceptance: `next.html` builds as a third Vite input and serves at `/next`; the module-list plugin fails the
    build on a forbidden import (fixture) and passes otherwise; `/` and `/resume` unchanged; size report printed.
    Confirms assumption 2 (`tokens.css` pulls in nothing else).
  - Verify: `npm run build`; fixture build fails; `npm run e2e` (existing desktop suite) passes; new e2e R1.a, R2.a;
    `npx wrangler dev` checks of R1.c (local only).
  - Files: `next.html`, `vite.config.ts`, `src/sheet/main.ts`, `tests/e2e/sheet.spec.ts`, `scripts/` or plugin file.
- [x] **T2** Content and card (R3, R11, R14, R18)
  - Acceptance: identity HTML transform with escaping; project virtual module with the five-file allowlist and field
    validation; `summary`/`status` added to the five files; `content/projects/castlewars.md` added; card visible
    without JS at 1440 and 390; Instrument Sans self-hosted with its OFL license; contrast unit test.
  - Verify: unit tests R11.a, R14.a/b, R18.a; e2e R3.a (JS off, two sizes).
  - Files: `vite.config.ts`, `content/projects/*.md`, `next.html`, `public/fonts/`, `tests/unit/sheet-content.test.ts`.
- [x] **T3** Physics module (R8)
  - Acceptance: pure `physics.ts` with flight, cap, clamp, pin velocity, log kick, oscillator; R8.b fixtures and R8.c
    settle bounds pass.
  - Verify: `npm test` (unit: R8.b, R8.c).
  - Files: `src/sheet/physics.ts`, `tests/unit/physics.test.ts`.
- [x] **T4** Sheet, view, zoom, minimap (R4, R5, R6, R16)
  - Acceptance: layout table and eight windows with reserved demo heights; pan (mouse with glide, wheel, touch,
    arrows); zoom (ctrl/meta wheel, Safari gesture events, pinch, buttons, fit from the viewport, no 15 % floor);
    minimap with keyboard; no saved state.
  - Verify: e2e R4.a/b, R5.a–d, R6.a, R7.a/b, R16.a in Chromium, mobile, Firefox, WebKit.
  - Files: `src/sheet/view.ts`, `src/sheet/layout.ts`, `src/sheet/sheet.css`, `next.html`, `tests/e2e/sheet.spec.ts`.
- [x] **T5** Gestures and windows (R7, R8, R9, R10, R21)
  - Acceptance: one-gesture owner; drag with exact grab point at any zoom and at edges; throw/pin/wobble from T3;
    Home by double-click and control; edge auto-scroll in px/s with release velocity excluding auto-scroll;
    cancel/blur end without a throw.
  - Verify: e2e R7.a, R8.a, R9.a, R10.a (60 and 120 Hz), R21.a/b.
  - Files: `src/sheet/gestures.ts`, `src/sheet/windows.ts`, `tests/e2e/sheet-windows.spec.ts`.
- [x] **T6** Card behaviour, Reset, phone (R12, R13, R15)
  - Acceptance: navigation to current window position with focus; nearest marking; Reset cancels and targets homes;
    phone bar with Escape and focus return; phone fit on CastleSiege.
  - Verify: e2e R11.b, R12.a/b, R13.a, R15.a (mobile).
  - Files: `src/sheet/main.ts`, `src/sheet/view.ts`, `tests/e2e/sheet-card.spec.ts`, `tests/e2e/compact-sheet.spec.ts`.
- [x] **T7** Keyboard and reduced motion (R17, R19)
  - Acceptance: windows are named regions in project order; focus visible and never under the card; Alt+arrows
    move; Home key; reduced motion commits every move at once, including mid-motion preference changes.
  - Verify: e2e R17.a, R19.a/b.
  - Files: `src/sheet/windows.ts`, `src/sheet/view.ts`, `src/sheet/sheet.css`, `tests/e2e/sheet-a11y.spec.ts`.
- [x] **T8** Budget and mock comparison (R20, R22)
  - Acceptance: JS + CSS ≤ 100 KiB gzip; no animation callbacks while idle; compare-vs-mock pass 1 against v0.6
    with only the deferred differences.
  - Verify: build size report; e2e R22.a (trace); `docs/review/spec-001-mock-vs-build.md` pass 1; owner shown the
    pairs page.
  - Files: `docs/review/spec-001-mock-vs-build.md`, `tests/e2e/sheet-perf.spec.ts`.
- [x] **T9** Implementation review
  - Acceptance: Codex read-only review of the 001 diff saved to `docs/review/spec-001-impl-review-codex.md` with
    dispositions; accepted fixes done; status set to `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.
