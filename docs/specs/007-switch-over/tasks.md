# 007 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (ponytail), then run lint, unit and the named e2e. Start after 001–006 are all
`Verified (local)`. The changes of T3–T8 stay in the working tree and go into the one switch commit of T9.

- [x] **T1** Inventory, no deletions (R1)
  - Acceptance: the ledger lists retained runtime code, build-time code, tests and assets, each with its reason
    (runtime import, build script, test, asset), and the delete list. It covers at least assumption 1 (resume
    generator and `src/apps/resume/doc.ts`, the four hosted apps with `src/apps/lib/` and `src/ui/`, the 002 resource
    sources in `system/`, the Castle Wars sprites, the mock builder's inputs). Nothing is deleted in this task.
  - Verify: review of R1.a in the ledger; module lists from the 001 guard plugin on `npm run build` and an import
    search back the reasons; `git status` shows only the ledger changed.
  - Files: `docs/ledger/`.
- [x] **T2** Retarget sheet tests to run on `/next` and `/` (R7)
  - Acceptance: one base-path helper lets every applicable 001–006 acceptance test run against `/next` or `/`
    (no-JS, mobile, a11y, reduced motion, downloads, lazy load, simulated-data labels). Old-OS-only expectations are
    marked for retirement in the inventory. Each browser project (Chromium, mobile, Firefox, WebKit) runs a non-zero
    number of sheet tests.
  - Verify: `npm run e2e:all` with the base path `/next` (still before the switch); per-project test counts in the
    ledger.
  - Files: `tests/e2e/sheet-base.ts`, `tests/e2e/helpers.ts`, `playwright.config.ts`, `tests/e2e/*.spec.ts` (path
    only).
- [x] **T3** Sheet at `index.html`, old OS deleted, guards retargeted (R2, R3)
  - Acceptance: in the working tree, `next.html` becomes `index.html` (served at `/`), and the files of the R1 delete
    list go, with their tests. The card HTML transform, the module guard (001 R2.b/c) and the budget report target
    `index.html` and fail with a message if that entry is missing. The forbidden-import fixture still fails the
    build. The budget report shows the shell (`/` first load) ≤ 100 KiB gzip JS + CSS and the lazy app and demo
    chunks separately. Nothing outside the delete list is deleted (Ask first). Owner 2026-10-24: the old-OS-only
    code paths in the kept apps are cut, with the `system/` files only they use, and A1–A3 are deleted.
  - Verify: `npm run build`; build with the sheet entry removed fails (R3.a); fixture build fails; size report.
  - Files: `index.html` (from `next.html`), `vite.config.ts`, the R1 delete list, `tests/fixtures/` (guard fixture).
- [x] **T4** Routing (R5)
  - Acceptance: `/next`, `/next.html` and `/next/` answer 301 to `/`; the twelve existing rules keep status and
    `Location`; `/resume` and `/resume.html` reach the resume; unknown paths answer 404 with the updated `404.html`.
  - Verify: local `npx wrangler dev` on `dist/` (no deploy) with a parameterized test that reads status and
    `Location` before following (R5.a).
  - Files: `public/_redirects`, `public/404.html`, `tests/e2e/routing.spec.ts`.
- [x] **T5** Package commands and generators (R4)
  - Acceptance: obsolete commands are removed or rewritten (the old filesystem `image` parts, `e2e:firefox` and
    `tests/e2e/firefox-smoke.mjs`). `gen:assets` writes only retained assets (no app folders of deleted apps, no
    `src/boot/mascot.ts`). The resume generator works without the old image builder. No command recreates a deleted
    path.
  - Verify: each remaining `npm run` command finishes locally (no `deploy`); `git status` shows no recreated deleted
    path. The clean-checkout run of R4.a is in T9.
  - Files: `package.json`, `scripts/gen-icons.ts`, `scripts/build-resume-html.ts`, `scripts/build-image.ts`.
- [x] **T6** Names (R6)
  - Acceptance: `/` has title "Rodrigo Arguello · RArgu OS", the escaped `identity.json` tagline as description,
    canonical, `og:type`, `og:url`, `og:title`, `og:description`. Package name `rargu-os` in `package.json` and
    `package-lock.json`. The resume's return link reads "Back to RArgu OS". About dialogs no longer say DevPageOS.
    `404.html` links to RArgu OS and the resume. No visitor-visible "DevPageOS" in `dist/`.
  - Verify: `npm test` (unit: raw production HTML tags, R6.a); `npm run e2e` (resume link text); text search of
    `dist/` after `npm run build`.
  - Files: `index.html` or `vite.config.ts` (head tags), `package.json`, `package-lock.json`,
    `scripts/build-resume-html.ts`, `src/apps/lib/open.ts`, `tests/unit/names.test.ts`.
- [x] **T7** Living docs and archive (R6, R9)
  - Acceptance: `README.md` and `docs/README.md` describe RArgu OS; `AGENTS.md` and the other living docs match what
    was built; specs 001–006 are set to `Archived` in the specs index (spec-driven step 7).
  - Verify: review of R9.a in the ledger (updated docs and archive entries).
  - Files: `README.md`, `docs/README.md`, `AGENTS.md`, `docs/specs/README.md`, `docs/ledger/`.
- [x] **T8** Deploy and rollback script with a local rehearsal (R11)
  - Acceptance: a script records the current Worker version id, runs the deploy, runs the live checks (Playwright
    Chromium and mobile with `E2E_BASE_URL`, and the R5 `curl -sI` checks), and on failure rolls back with
    `npx wrangler rollback <version-id> --name rargu-devpage` and re-runs the routing and resume checks. A local
    rehearsal against a dry-run stub with a forced live-check failure runs the rollback branch. No real deploy and
    no network in this task.
  - Verify: local rehearsal run of R11.a (first part) against the stub; output in the ledger.
  - Files: `scripts/deploy-live.ts`, `tests/unit/deploy-live.test.ts`, `docs/ledger/`.
- [x] **T9** Full checks, tag and switch commit (R2, R4, R7, R8)
  - Acceptance: on the final working tree, lint, unit, `npm run e2e:all` (base path `/`), compare-vs-mock against
    the latest approved mock, and the R3 budget all pass. Then the local tag `devpageos-final` is set on the current
    commit, and the one switch commit is made on top of it. Then R4.a runs on a clean local checkout of that commit.
    The tag is not pushed.
  - Verify: `npm run lint && npm test && npm run e2e:all`; per-project sheet test counts in the ledger (R7.a);
    `docs/review/spec-007-mock-vs-build.md`; R2.a with `git rev-parse 'devpageos-final^{commit}'` and `git ls-tree`;
    R4.a in a clean local worktree (no network).
  - Files: `docs/review/spec-007-mock-vs-build.md`, `docs/ledger/`.
- [x] **T10** Implementation review
  - Acceptance: Codex read-only review of the 007 diff saved to `docs/review/spec-007-impl-review-codex.md` with
    dispositions; accepted fixes done (as a follow-up commit; the tag stays on the switch commit's parent); status set
    to `Verified (local)`. This review comes before the gated tasks, so nothing unreviewed is deployed.
  - Verify: review file; full `npm run lint && npm test && npm run e2e:all`.
  - Files: `docs/review/`, `docs/specs/README.md`, `docs/ledger/`.
- [x] **T11** Owner preview (R10) (second run approved 2026-10-24, see the approval record)
  - Acceptance: the owner checks the build at a named commit (`npm run build && npm run preview`, or
    `npx wrangler dev`); the result, date, commit and serving command go into 007's approval record.
  - Verify: R10.a in the spec's approval record (owner check).
  - Files: `docs/specs/007-switch-over/spec.md` (approval record only), `docs/ledger/`.
- [x] **T12** Deploy to rargu.dev (R5, R11) — **G-deploy** (done 2026-10-24 by spec 010 T7: `b686b0e`, Worker `f9745fa4`)
  - Acceptance: ask the owner for G-deploy with the exact commit, the T9/T10 check results and the recorded previous
    Worker version id. The owner approves G-deploy at that time; spec approval does not count. Only then run
    `npm run deploy` through the T8 script, then the live checks. On failure, roll back to the recorded version and
    re-check routing and the resume.
  - Verify: live level: `E2E_BASE_URL=https://rargu.dev npx playwright test --project=chromium --project=mobile` and
    the R5 routing checks with `curl -sI`; the ledger has the previous version id, deploy output, new version id and
    live results, or the rollback output and re-check results (R11.a). Status `Verified (live)` only on success.
  - Files: `docs/ledger/`, `docs/specs/README.md`.
- [x] **T13** Repo rename follow-up (R12) — **G-push** (done 2026-10-24 by spec 010 T6: new public repo `RArgu/rargu-os`)
  - Acceptance: after the owner renames the GitHub repo, update `identity.json` `repoUrl`, `content/README.md` and
    the local `origin` URL. Pushing commits or the `devpageos-final` tag is a separate G-push request; the owner
    approves G-push at that time.
  - Verify: R12.a with `git remote get-url origin` and a text check of `repoUrl` and `content/README.md`; review.
  - Files: `content/identity.json`, `content/README.md`, `docs/ledger/`.

Coverage: R1–R12 all mapped.
