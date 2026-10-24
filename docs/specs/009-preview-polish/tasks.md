# 009 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Branch `spec-009-polish` from `f54ed3c`.

- [x] **T1** Smooth drag (R1, R2, R3, R4)
  - Acceptance: R1.a–b, R2.a–b, R3.a–b, R4.a; 001 Approach "Physics", R8.c and an R20 note amended; OWNER_QUESTIONS
    "Wobble" row updated.
  - Verify: `npm test` (physics fixtures); `CI=1 npx playwright test` sheet-windows, compact-sheet, sheet-perf and
    the new R4 test (three browsers; R4 Chromium, one worker, 5 runs).
  - Files: `src/sheet/physics.ts`, `src/sheet/windows.ts`, `src/sheet/sheet.css`, `tests/unit/physics*.test.ts`,
    `tests/e2e/sheet-windows.spec.ts`, `tests/e2e/compact-sheet.spec.ts`, `tests/e2e/sheet-perf.spec.ts`,
    `docs/specs/001-sheet/spec.md`, `docs/OWNER_QUESTIONS.md`.
- [x] **T2** Music hint removed and phone card mark (R5, R7)
  - Acceptance: R5.a; R7.a–b; 001 R12/R12.b amended.
  - Verify: `npm test`; `CI=1 npx playwright test` castlesiege-sheet, quick-tools-music, compact-sheet, sheet-card.
  - Files: `src/apps/lib/open.ts`, `src/apps/castlesiege/main.ts`, `src/apps/tracker/main.ts`, `src/sheet/view.ts`,
    `tests/e2e/compact-sheet.spec.ts`, `docs/specs/001-sheet/spec.md`.
- [x] **T3** 404 page (R6)
  - Acceptance: R6.a–f, starting from the Fable draft.
  - Verify: `npm test` (404 unit and behaviour fixtures); `CI=1 npm run e2e:routing` (with WebKit and mobile).
  - Files: `public/404.html`, `tests/unit/page-404.test.ts`, `tests/e2e/routing.spec.ts` (or `page-404.spec.ts`),
    `playwright.routing.config.ts`.
- [x] **T4** Review and full checks (R8)
  - Acceptance: Codex review saved to `docs/review/spec-009-impl-review-codex.md` with dispositions; accepted fixes;
    compare-vs-mock for the held/post-pin states noted; status `Verified (local)`.
  - Verify: `npm run lint && npm test && CI=1 npm run e2e:all && CI=1 npm run e2e:routing`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R8 all mapped.
