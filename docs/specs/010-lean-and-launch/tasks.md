# 010 tasks

Ordered by dependency. Check a box only after its verification has run.

- [x] **T1** Held lean on the sheet (R1, R3)
  - Acceptance: R1.a, R1.b, R1.c (sheet), R1.e, R1.f; R3.a.
  - Verify: new tests fail on HEAD first; `npm test`; `CI=1 npx playwright test tests/e2e/sheet-windows.spec.ts
    tests/e2e/sheet-a11y.spec.ts tests/e2e/drag-perf.spec.ts`.
  - Files: `src/sheet/physics.ts`, `src/sheet/windows.ts`, `tests/unit/physics.test.ts`,
    `tests/e2e/sheet-windows.spec.ts`, `tests/e2e/sheet-a11y.spec.ts`.
- [x] **T2** 404: held lean, tip removed, hidden hint (R1.c–d, R2)
  - Acceptance: R1.c (404), R1.d, R2.a, R2.b.
  - Verify: new tests fail on HEAD first; `npm test`; `CI=1 npm run e2e:routing`.
  - Files: `public/404.html`, `tests/unit/page-404.test.ts`, `tests/e2e/routing-404.spec.ts`.
- [x] **T3** Docs and content (R4, R8)
  - Acceptance: 001 "Physics" held sentence, OWNER_QUESTIONS rows, 009 and 007 approval records, `repoUrl`,
    `content/README.md`, `.gitignore` and untracking of the five folders.
  - Verify: review; `git ls-files` check (R4.c).
  - Files: `docs/specs/001-sheet/spec.md`, `docs/OWNER_QUESTIONS.md`, `docs/specs/009-preview-polish/spec.md`,
    `docs/specs/007-switch-over/spec.md`, `content/identity.json`, `content/README.md`, `.gitignore`.
- [ ] **T4** Release SHA and full checks (R7, R8)
  - Verify: clean tree; `npm run lint`; `npm test`; `CI=1 npm run e2e:all`; `CI=1 npm run e2e:routing`.
- [ ] **T5** Fast-forward `main` (R6)
  - Verify: R6.a.
- [ ] **T6** Publication scan, repo, push (R4) — G-push (given)
  - Verify: R4.a, then `gh repo create`, root commit, push; R4.b, R4.c.
- [ ] **T7** Deploy (R5) — G-deploy (given)
  - Verify: `npm run deploy:live` from the release tree; R5.a.
- [ ] **T8** Evidence commit and push (R8)
  - Verify: ledger, 007/010 status; `git push origin main`.
