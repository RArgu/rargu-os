# Spec 007 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166e9-b0a1-7321-9052-d680712fdbc7 · **Tokens:** 118,365
- **Date:** 2026-10-22 · **Commit:** 7b02c09

## Dispositions

Checked by Claude: `scripts/gen-icons.ts` writes `src/boot/mascot.ts`, `public/_redirects` has 12 rules,
`scripts/build-resume-html.ts:51` link text. All 10 accepted.

| # | Sev | Disposition | Change |
|---|---|---|---|
| 1 | High | Accepted | Assumption 1 + R1 inventory; sprites, resume parser, allowlist kept. |
| 2 | High | Accepted | R7: retarget 001–006 checks to `/`; non-zero counts per project. |
| 3 | Medium | Accepted | R3: guards and budget target `index.html` and fail if missing. |
| 4 | Medium | Accepted | R4: package commands and generators audited. |
| 5 | Medium | Accepted | R11: previous version id, live commands, verified rollback, rehearsal. |
| 6 | Medium | Accepted | R2: one switch commit; tag on its parent; `rev-parse` check. |
| 7 | Medium | Accepted | R5: `/next/` and all twelve rules. |
| 8 | Medium | Accepted | R6: "Back to RArgu OS"; About text. |
| 9 | Low | Accepted | R6.a: all meta fields; both package files. |
| 10 | Low | Accepted | R9.a, R10.a, R12.a added. |

## Codex output (verbatim)

Revise spec 007 before approval. The main gaps concern deletion scope and verification after the route move.

**Evidence:** Observed facts below come from read-only `nl -ba`, `rg`, and `git` commands. **Derived** statements describe their consequences.

1. **High — The deletion assumption omits required Castle Wars assets.** [007/spec.md:16](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:16)

   **Observed:** Assumption 2 classifies the other apps as old-OS-only. However, spec 005 requires PNG and JSON files from `src/apps/castlewars/art/` (`005-wip-windows/spec.md:16`). The mock builder also reads them (`docs/mockups/rargu-os-src/build.py:12`). The resume parser remains a build dependency (`scripts/build-resume-html.ts:5`).

   **Derived:** The stated inventory can authorize deletion of required assets. A browser bundle’s module list alone does not establish build-script or mock-builder dependencies.

   **Spec fix:** Replace the blanket assumption: “T1 inventories retained runtime code, build-time code, tests, and assets before deletion. Preserve Castle Wars sprite PNG/JSON files, the resume parser, and the host resource allowlist.” Mark future sheet dependencies **[Prop]**, pending T1.

2. **High — R6 does not require the inherited checks to exercise `/`.** [007/spec.md:33](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:33)

   **Observed:** Earlier acceptance checks target `/next`, including no-JavaScript content, mobile layout, motion, and simulated-data labels (`001-sheet/spec.md:71`, `:113`, `:116`; `006-data-demos/spec.md:41`). The mobile Playwright project selects only filenames containing `compact` (`playwright.config.ts:32`). Existing files also mix retained app checks with obsolete OS behavior (`tests/e2e/extras.spec.ts:364`).

   **Derived:** Deleting old tests and running the remaining suite does not prove that each browser project covers the final sheet. A passing aggregate result can omit phone coverage.

   **Spec fix:** Add: “Retarget applicable acceptance checks from 001–006 to `/`. Retire only old-OS expectations. Record executed checks and nonzero test counts for every required browser project.” Explicitly retain accessibility, reduced-motion, download, lazy-load, and honesty checks. Keep feature fixes in their original specs.

3. **Medium — Entry-dependent build checks can stop checking the sheet.** [007/spec.md:44](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:44)

   **Observed:** Spec 001 defines the module guard and size report for the `next` entry (`001-sheet/spec.md:66`, `:128`). Its approach also adds entry-specific HTML generation (`:133`). Spec 007 explicitly migrates only metadata logic (`007/spec.md:60`).

   **Derived:** A guard that silently skips a missing `next` entry can pass after the move. Directory absence does not prove that the guard still works.

   **Spec fix:** Add: “Retarget every sheet HTML transform, module guard, and budget report to `index.html`. Fail when the expected entry is absent.” Retain the forbidden-import failure fixture. Define the 100 KiB accounting after demos exist, including shared chunks and the distinction between shell and lazy app transfers.

4. **Medium — The retained asset command recreates deleted apps and then fails.** [007/spec.md:30](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:30)

   **Observed:** `npm run gen:assets` invokes both generators (`package.json:10`). The icon generator recreates app directories (`scripts/gen-icons.ts:2011`, `:2019`), writes Guide assets (`:2056`), and writes `src/boot/mascot.ts` without creating its parent (`:2143`). R6 does not exercise this command.

   **Derived:** After R3 deletes `src/boot/`, the documented generator can restore obsolete app folders before failing.

   **Spec fix:** Add: “Audit all package commands and generator outputs. Remove obsolete commands or restrict generators to retained assets. Keep resume generation independent of the deleted image builder.” Verify retained commands from a clean checkout and confirm that they do not recreate deleted paths.

5. **Medium — Rollback has no recorded target or restoration check.** [007/spec.md:36](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:36)

   **Observed:** R9 records the new Worker version only. R9.a requires a rollback command and output, but does not require successful restoration (`:51`). The current Playwright server uses Vite preview, while Cloudflare routing comes from Wrangler (`playwright.config.ts:16`; `wrangler.jsonc:15`).

   **Derived:** The ledger can satisfy R9.a with an unsuccessful rollback. A successful browser suite also does not establish production redirect status codes.

   **Spec fix:** Add: “Before deploy, record the active version to restore. Define the exact live test command and routing smoke checks. On failure, restore that version and verify the previous site, resume, and routing. Record restoration success or an unresolved failure.” A local forced-failure rehearsal should prove that the failure branch executes.

6. **Medium — The tag sequence contradicts R2.a, and its command cannot verify the target.** [007/spec.md:43](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:43)

   **Observed:** The approach tags first, commits the entry move, then commits deletion (`:57`). R2.a requires the tag on the deletion commit’s parent. `git tag --list devpageos-final` lists a name, not its target commit.

   **Derived:** Following the approach leaves at least one intervening commit. The acceptance command still passes when the tag points elsewhere.

   **Spec fix:** Require the entry replacement and deletion in one switch commit. Tag its parent immediately beforehand. Verify that `git rev-parse 'devpageos-final^{commit}'` equals the switch commit’s parent. Also inspect the tagged tree for the old entry and code.

7. **Medium — Routing acceptance omits an existing sheet alias and most legacy redirects.** [007/spec.md:41](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:41)

   **Observed:** Spec 001 supports `/next/` as well as `/next` and `/next.html` (`001-sheet/spec.md:62`). R1 omits `/next/`. R7.a checks two examples from twelve existing redirect rules (`public/_redirects:2`).

   **Derived:** `/next/` can become a 404. Removing the contact, writing, work, or terminal redirects can still pass R7.a.

   **Spec fix:** Include `/next/` in the redirect requirement. Add a parameterized local Wrangler check for every existing literal rule and a representative path for every wildcard. Assert status and `Location` before following redirects. Verify `/resume.html` still reaches the working resume.

8. **Medium — Renaming the resume link still leaves a false feature claim.** [007/spec.md:31](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:31)

   **Observed:** The generator emits “Open this resume inside DevPageOS” with a link to `/` (`scripts/build-resume-html.ts:51`). The sheet host excludes the Resume app (`002-app-host/spec.md:10`). Shared About dialogs also contain “A DevPageOS program” (`src/apps/lib/open.ts:187`).

   **Derived:** Replacing the product name leaves “Open this resume inside RArgu OS,” although `/` does not open the resume.

   **Spec fix:** Require a truthful return label, such as “Back to RArgu OS.” Test the generated resume navigation and each retained app’s About dialog. Preserve the resume document, print behavior, and no-JavaScript access.

9. **Low — Rename acceptance misses required metadata and the lockfile.** [007/spec.md:46](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:46)

   **Observed:** R4.a checks title, canonical, and `og:title`. R4 also requires a description and Open Graph tags. The current plugin emits `og:type`, `og:url`, and `og:description` (`vite.config.ts:57`). Package names also exist in `package-lock.json:2` and `:8`.

   **Derived:** Missing descriptions, stale preview URLs, or inconsistent package names can pass R4.a.

   **Spec fix:** Check every required metadata field in raw production HTML. Assert that descriptions equal the escaped identity tagline. Require matching `rargu-os` names in both package files.

10. **Low — R5 and R8 lack acceptance checks.** [007/spec.md:39](/Users/rargu/DevPageOS/docs/specs/007-switch-over/spec.md:39)

    **Observed:** The acceptance section has no R5.a or R8.a. R10.a also omits the required `content/README.md` update (`:53`).

    **Derived:** Documentation review and owner preview lack explicit completion evidence.

    **Spec fix:** Add checks that name the living documents and archive records. Require a dated owner preview result tied to the reviewed commit and serving command. Extend R10.a to check the content documentation after the owner’s rename.

**Could not check:** The sheet is not implemented in this checkout (`rg --files src/sheet` reports no directory). I verified the v0.6 mock hash, but did not render it. Future layout, browser behavior, accessibility, performance, and motion remain **Unverified**. I did not run build, lint, tests, or browsers because the pipelines write files. No network actions, deploys, or file changes occurred.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (being redesigned as RArgu OS). Do not modify files.

Read first: AGENTS.md; docs/specs/007-switch-over/spec.md (the spec under review); docs/specs/001-sheet/spec.md, docs/specs/002-app-host/spec.md and the other specs in docs/specs/ it depends on (critiques in docs/review/); docs/OWNER_QUESTIONS.md (owner decisions, binding); docs/mockups/README.md; wrangler.jsonc, public/_redirects, public/_headers, public/404.html, vite.config.ts, index.html, package.json, scripts/, tests/, playwright.config.ts, content/identity.json, content/README.md, README.md, docs/README.md, src/ (to check what the old OS code is and what the sheet still needs).

Task: critique spec 007 before the owner approves it. Check that each requirement is right about the current code and mock (cite path:line), testable, and that each acceptance check can fail. Look for missing requirements, conflicts with other specs or owner decisions, honesty of labels (simulated data, unbuilt features), performance and reduced motion, accessibility, and work that belongs in another spec.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
