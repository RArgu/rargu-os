# 007: Switch-over (RArgu OS becomes rargu.dev)

**Status:** Verified (local) (branch `spec-007-switchover`; T11 owner preview next); Approved · **Owner approval:** 2026-10-22 · **Gates needed:** G-deploy (R11), G-push (R12, owner)
**Related:** specs 001–006 (all Verified (local) first); OWNER_QUESTIONS 2026-10-22 (old OS deleted with a tag,
renames, repo rename by owner, Worker name kept); `wrangler.jsonc`; `public/_redirects`; `public/404.html`;
`vite.config.ts`; critique `docs/review/spec-007-critique-codex.md` (10 findings, all accepted).

## Why

Specs 001–006 build RArgu OS at `/next` beside the old OS. This spec makes it the site: the sheet moves to `/`, the
old DevPageOS code goes, names change to RArgu OS, and the result is deployed to rargu.dev with the owner's approval.

## Assumptions

1. Dependencies to keep, at least: the resume generator and `src/apps/resume/doc.ts` (`scripts/build-resume-html.ts:5`),
   the four hosted apps with `src/apps/lib/` and `src/ui/`, the 002 resource allowlist sources in `system/`, the Castle
   Wars sprite PNG/JSON files (005), and the mock builder's inputs (`docs/mockups/rargu-os-src/build.py:12`). [Code]
   The full list is **[Prop]** until T1's inventory.
2. `npm run gen:assets` runs `scripts/gen-icons.ts`, which recreates app folders and writes `src/boot/mascot.ts`
   (`scripts/gen-icons.ts:2011-2143`). [Code]
3. `public/_redirects` has twelve rules to `/` (`public/_redirects:2-13`); the resume page says "Open this resume
   inside DevPageOS" (`scripts/build-resume-html.ts:51`); About dialogs say "A DevPageOS program"
   (`src/apps/lib/open.ts:187`). [Code]
4. Worker `rargu-devpage` and its route stay (owner). Rollback: `npx wrangler rollback <version-id> --name
   rargu-devpage` (`wrangler.jsonc`). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Inventory (T1): retained runtime code, build-time code, tests and assets, and the delete list, written into the ledger before any deletion. | [Prop] | review | — |
| R2 | One switch commit moves the sheet to `index.html` (served at `/`) and deletes the old-OS-only code and tests of the R1 delete list. Its parent is tagged `devpageos-final` (local tag) just before. | [Prop] | git + build | — |
| R3 | Every sheet HTML transform, the module guard (001 R2.b/c) and the budget report now target `index.html` and fail if that entry is missing. The forbidden-import fixture still fails the build. Budget: the shell (`/` first load) ≤ 100 KiB gzip JS + CSS; lazy app and demo chunks are reported separately. | [Prop] | build | — |
| R4 | Package commands: obsolete ones (`image` parts for the old filesystem image, `e2e:firefox` smoke) are removed or rewritten; generators write only retained assets; no command recreates a deleted path. The resume generator works without the old image builder. | [Prop] | local | — |
| R5 | Routing: `/next`, `/next.html` and `/next/` answer 301 to `/`; all twelve existing redirect rules keep their status and `Location`; `/resume` and `/resume.html` reach the resume; unknown paths answer 404 with the updated `404.html`. | [Prop] | local wrangler + live | — |
| R6 | Names: title "Rodrigo Arguello · RArgu OS"; description = the escaped `identity.json` tagline; canonical, `og:type`, `og:url`, `og:title`, `og:description` on `/`; package name `rargu-os` in `package.json` and `package-lock.json`; README and `docs/README.md` describe RArgu OS; `404.html` links to RArgu OS and the resume; the resume's return link reads "Back to RArgu OS"; About dialogs no longer say DevPageOS. No visitor-visible "DevPageOS". | [Prop] | unit + e2e | — |
| R7 | Tests: applicable acceptance checks of 001–006 are retargeted from `/next` to `/` (including no-JS, mobile, a11y, reduced motion, downloads, lazy load, simulated-data labels); only old-OS expectations are retired. Each browser project (Chromium, mobile, Firefox, WebKit) runs a non-zero number of sheet tests. | [Prop] | e2e | — |
| R8 | All checks pass on the switch commit: lint, unit, `npm run e2e:all`, compare-vs-mock against the latest approved mock, the R3 budget. | [Prop] | local | — |
| R9 | `AGENTS.md` and living docs describe RArgu OS; specs 001–006 are archived (spec-driven step 7). | [Prop] | review | — |
| R10 | Owner preview: the owner checks the build (`npm run build && npm run preview`, or `npx wrangler dev`) at a named commit; the result and date are recorded. | [Prop] | preview (owner) | — |
| R11 | Deploy: before deploy, record the current Worker version id (to restore). Deploy with `npm run deploy` only after the owner approves G-deploy for that commit. Then run the live checks (`E2E_BASE_URL=https://rargu.dev npx playwright test --project=chromium --project=mobile` plus the R5 routing checks with `curl -sI`). On failure, roll back to the recorded version, re-run the routing and resume checks against it, and record success or the unresolved failure. | [Prop] | live | G-deploy |
| R12 | After the owner renames the GitHub repo: update `identity.json` `repoUrl`, `content/README.md` and the local `origin` URL. Pushing commits or the tag is a separate G-push request. | [Prop] | review | G-push (owner) |

### Acceptance

- **R1.a** The ledger has the inventory with each kept item's reason (runtime import, build script, test, asset).
- **R2.a** `git rev-parse 'devpageos-final^{commit}'` equals the switch commit's parent; `git ls-tree` of the tag
  shows `src/kernel/` and the old `index.html`; the switch commit's tree has neither.
- **R3.a** Removing the sheet entry from the build input makes the build fail with a message; the forbidden-import
  fixture fails; the budget report shows shell ≤ 100 KiB.
- **R4.a** On a clean checkout, each remaining `npm run` command finishes, and `git status` shows no recreated
  deleted path.
- **R5.a** A parameterized local `wrangler dev` test checks status and `Location` (before following) for the three
  `/next` forms, each literal rule and one path per wildcard rule, `/resume`, `/resume.html`, and `/nope`.
- **R6.a** In raw production HTML of `/`, every R6 tag is present with the expected value; both package files say
  `rargu-os`; the resume's return link text is "Back to RArgu OS"; a text search of `dist/` finds no "DevPageOS".
- **R7.a** The ledger records the test count per browser project, each > 0, with the R7 areas named.
- **R9.a** The ledger lists the updated living docs and the archive entries for 001–006.
- **R10.a** The spec's approval record has the owner's preview result, date, commit and serving command.
- **R11.a** A local rehearsal with a forced live-check failure runs the rollback branch (against a dry-run stub).
  On the real deploy, the ledger has the previous version id, the deploy output, the new version id and the live
  check results; on failure, the rollback output and the re-check results.
- **R12.a** After the rename, `git remote get-url origin`, `repoUrl` and `content/README.md` name the new repo.

## Approach

- Clarification (2026-10-22, task-list review; requirements unchanged): R3–R9 work is done in the working tree,
  checked in full, then committed as the one switch commit with the tag on its parent (R2); review fixes follow in
  a separate commit. Original order note: inventory (R1) → retarget tests to work on both `/next` and `/` (R7) → tag + switch commit (R2, R3, R5) →
  commands and generators (R4) → names and docs (R6, R9) → full checks (R8) → owner preview (R10) → G-deploy request
  with commit, checks and previous version id (R11).
- **Rejected:** keeping the old OS at `/os`; keeping its code unbuilt (owner chose delete).

## Boundaries

- **Always:** ask for G-deploy with the exact commit and checks; record everything in the ledger.
- **Ask first:** deleting anything outside the R1 delete list; renaming the Worker; any push.
- **Never:** deploy without approval; push without G-push; delete `content/`, `art-source/`, the resume generator or
  the Castle Wars sprites.

## Out of scope

- The real crawler and Polymarket tools; analytics.

## Open questions

- None.

## Owner decisions (2026-10-24, T1 inventory "Ask first" items)

- **A1–A3:** also delete `report/shots/`, `tools/eye.mjs`, `tools/eye-example-tracker-lesson.mjs`,
  `tools/firefox-bidi-smoke.mjs` and `design/mockups/` (old Win 3.1 mockups; `design/battler/` stays).
- **S2 (A4):** cut the old-OS-only code paths in the four kept apps in 007 (Set as Wallpaper, lessons, Help docs,
  CastleSiege saved settings and similar `onSheet` else-branches), with the `system/` files only they use. Part of
  T3; the R1 delete list grows by what this frees.
- **A6:** retire the 008 old-OS tests; port only the tests of shared code (`src/ui/menu.ts`) to the sheet (T2).
- **A7:** old-OS docs move to `docs/archive/` (T7).
- Lead decisions: **A5** `tests/unit/themes.test.ts` keeps its contrast checks on the kept themes; the kernel-theme
  parts retire. **A8** unused icons stay.

## Approval record

2026-10-22 — Owner approved this spec as written ("Approve all", together with 001 Amendment 1 and specs 002–007),
including the proposals named in it. No gate is approved by this.

2026-10-24 — **T11 owner preview** (R10.a): commit `83b56bb`, served with `npm run build && npx wrangler dev --local`
at `http://localhost:8787/`. Result: not yet approved for deploy. Owner feedback: window drags look janky ("like
motion blur"), make the wobble less aggressive; change the CastleSiege music hint; a new 404 page (Fable proposes,
e.g. numbers you can move); fix the phone card's marked project if it needs a fix; archive the Castle Wars art docs
in their own folder (done). The fixes go in spec 009; the preview is repeated after it.

2026-10-24 — **T11 owner preview, second run** (R10.a): commit `b7c33c8` (spec 009 Verified (local)), served with
`npm run build && npx wrangler dev --local` at `http://localhost:8787/` and `/nope`. Result: approved for deploy,
with two changes first (spec 010): the held lean back without the grow, and the 404 tip line removed. Owner: "G-deploy
OK" for the commit that passes all checks (spec 010 R5, R7). The repo rename (R12) became a new public repo
`RArgu/rargu-os` with a fresh history (spec 010 R4), because no GitHub repo existed.
