# 008 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Branch `spec-008-oldos` from
`spec-003-castlesiege` (`9eeeeb7`).

- [x] **T1** Hot-seat cancel and menu state on the old OS (R1, R2)
  - Acceptance: R1.a–R1.c and R2.a–R2.b pass on `/`; the open popup closes on a menu rebuild with focus in the
    CastleSiege window; lessons unchanged.
  - Verify: `CI=1 npx playwright test tests/e2e/castlesiege.spec.ts` (Chromium, Firefox, WebKit); sheet CastleSiege
    specs unchanged and passing.
  - Files: `src/apps/castlesiege/main.ts`, `src/wm/window.ts` (or `src/ui/menu.ts`), `tests/e2e/castlesiege.spec.ts`.
- [x] **T2** Live reduced motion and music on the old OS (R3, R4)
  - Acceptance: R3.a–R3.b and R4.a–R4.d pass on `/`; the existing old-OS music test is updated as R5.a says; the
    old-OS rules text says Sound = effects, Music = both songs.
  - Verify: `CI=1 npx playwright test tests/e2e/castlesiege.spec.ts` (three browsers); `npm test`
    (`tests/unit/castlesiege-music.test.ts`).
  - Files: `src/apps/castlesiege/main.ts`, `src/wm/wm.ts`, `system/usr/share/doc/castlesiege.md`,
    `tests/e2e/castlesiege.spec.ts`.
- [x] **T3** Implementation review
  - Acceptance: Codex read-only review of the 008 diff saved to `docs/review/spec-008-impl-review-codex.md` with
    dispositions; accepted fixes done; R5.a holds; status `Verified (local)`.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.

Coverage: R1–R5 all mapped.
