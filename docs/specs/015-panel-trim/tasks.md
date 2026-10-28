# 015 tasks

Ordered by dependency. Check a box only after its verification has run.

- [x] **T1** Email: parts in `identity.json`, `src/sheet/email.ts`, panel/notice/resume/insider use it, Copy removed,
  `scripts/check-no-email.ts` (R3)
  - Acceptance: R3.a to R3.f
  - Verify: `npm test`; `node scripts/check-no-email.ts dist README.md` prints `clean` on production and fixture builds
  - Files: `content/identity.json`, `scripts/sheet-content.ts`, `src/sheet/email.ts`, `src/sheet/main.ts`, `scripts/build-resume-html.ts`
- [x] **T1b** Email out of the repo: local git-ignored file, fixture file, mocks/ledger placeholder, hash update (R9)
  - Acceptance: R9.a to R9.c
  - Verify: `node scripts/check-no-email.ts dist --tracked`; `git grep -n -i` on the address and its local part prints nothing; `npm test`
  - Files: `.gitignore`, `scripts/sheet-content.ts`, `scripts/build-resume-html.ts`, `scripts/check-no-email.ts`, `docs/mockups/*`, `docs/ledger/*`
- [x] **T2** Panel: delete heading and hint, hide name/title/tagline and title block, aria changes, 150 px layout (R1, R2, R4, R5)
  - Acceptance: R1.a, R1.b, R2.a to R2.c, R4.a, R4.b, R5.a, R5.b
  - Verify: `npm run e2e` (card and compact specs) at the spec's viewports
  - Files: `scripts/sheet-content.ts`, `index.html`, `src/sheet/sheet.css`
- [x] **T3** Copy and heights: five summaries, four heights, clamp (R6)
  - Acceptance: R6.a to R6.c
  - Verify: `npm test` (word limit), `npm run e2e` (blurb height)
  - Files: `content/projects/*.md`, `src/sheet/layout.ts`, `src/sheet/sheet.css`
- [x] **T4** Notes yellow (R7)
  - Acceptance: R7.a to R7.d
  - Verify: unit contrast test, `npm run e2e` (notes spec)
  - Files: `src/sheet/sheet.css`, tests
- [x] **T5** Tests, docs, compare-vs-mock (R8)
  - Verify: `npm run lint`, `npm test`, `npm run e2e`; compare-vs-mock list
  - Files: tests, `docs/specs/README.md`
