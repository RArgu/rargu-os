# Spec 007 implementation review (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16cd1-2ac4-7313-988b-91159b59db4f · **Tokens:** 196,976
- **Date:** 2026-10-24 · **Scope:** `1d43e88..d626794` (T2 `580165c`, switch commit `d626794`)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Live checks run e2e-only tests against production, so a healthy deploy rolls back (R11) | Accepted. A production-safe live test selection, proven against a local production build. Fixed (`@live`, 38 tests). |
| 2 | `$&`-style tokens in the tagline corrupt the head tags (R6) | Accepted. Replacement callbacks; fixture with HTML characters and tokens. Fixed (`scripts/site-identity.ts`). |
| 3 | Routing tests derive the twelve rules from `_redirects` itself (R5) | Accepted. Fixed expectations, checked against the file and the responses. Fixed (`scripts/routes.ts`). |
| 4 | A redirect without `Location` passes (R5.a) | Accepted. Fixed. |
| 5 | Old-OS-only code left after S2 (`openPath` chain, CastleSiege `playSfx`) | Accepted. Fixed (~570 lines cut). |

Fixes go in a follow-up commit; the tag stays on the switch commit's parent.

## Codex output (verbatim)

What this change does: It moves RArgu OS to `/`, removes the old OS, and updates routing, names, generators, and documentation. Five findings remain.

1. **High — The live checks will reject a healthy production deploy.** [scripts/deploy-live.ts:189](/Users/rargu/DevPageOS/scripts/deploy-live.ts:189)

   **Observed** (`nl -ba`, `rg`): the script runs the full Chromium and mobile suites. A selected test opens `?host=notes:fx-size` and expects the title `"x"` ([host-load.spec.ts:52](/Users/rargu/DevPageOS/tests/e2e/host-load.spec.ts:52)). Production enables these fixtures and `__host` only when `MODE === "e2e"` ([load.ts:117](/Users/rargu/DevPageOS/src/sheet/host/load.ts:117)). Other selected tests require the absent `host-assets.json`.

   **Derived:** these tests fail against the normal production build. The script then rolls back a healthy deployment. T8’s stub rehearsal cannot detect this command-selection error. This breaks the prepared R11 deploy flow.

   **Fix:** select tests that work against production when `E2E_BASE_URL` is set. Keep fixture-dependent checks local. Verify that selection against a normal production build before T12.

2. **Medium — Replacement tokens corrupt the escaped tagline.** [vite.config.ts:90](/Users/rargu/DevPageOS/vite.config.ts:90), [vite.config.ts:99](/Users/rargu/DevPageOS/vite.config.ts:99)

   **Observed** (read-only `node --input-type=module -e …`, calling the existing HTML hook in memory): the tagline `Build $& tools` produces an Open Graph description containing `"Build </title>amp; tools"`. The regular description also becomes malformed.

   The evidence is the replacement string `` `$1${esc(id.tagline)}"` ``. HTML escaping leaves JavaScript replacement tokens active. The new test uses the current tagline, which contains no such characters ([names.test.ts:31](/Users/rargu/DevPageOS/tests/unit/names.test.ts:31)).

   **Derived:** R6’s escaped-tagline requirement fails for valid content containing `$&`, `$$`, or similar tokens. This inherited logic remains in the updated metadata plugin.

   **Fix:** use replacement callbacks for content insertion. Add a metadata fixture containing HTML characters and replacement tokens.

3. **Medium — The tests do not protect the twelve existing redirect rules.** [tests/e2e/routing.spec.ts:15](/Users/rargu/DevPageOS/tests/e2e/routing.spec.ts:15)

   **Observed** (`nl -ba`): expected paths, destinations, and statuses come directly from `public/_redirects`: `"return { path, status: Number(status), location: to }"`. The deploy script likewise derives its checks from that file ([deploy-live.ts:68](/Users/rargu/DevPageOS/scripts/deploy-live.ts:68)).

   **Derived:** deleting `/contact/*` removes its test. Changing its status to 302 changes the expected result to 302. Both can pass despite violating R5’s requirement to preserve the existing contract. The current twelve rules are unchanged.

   **Fix:** define the twelve required path/status/destination cases independently. Check the file and the HTTP responses against those expectations.

4. **Low — A redirect without `Location` can pass.** [tests/e2e/routing.spec.ts:47](/Users/rargu/DevPageOS/tests/e2e/routing.spec.ts:47)

   **Observed** (`nl -ba`): the assertion uses `new URL(location ?? "", baseURL)`. With no header, this resolves to the root URL.

   **Derived:** a 301 without `Location` passes every case expecting `/`. R5.a requires the test to check the actual header.

   **Fix:** assert that `location` exists before resolving and comparing it.

5. **Low — S2 leaves old-OS-only code behind.** [src/apps/lib/open.ts:85](/Users/rargu/DevPageOS/src/apps/lib/open.ts:85), [src/apps/castlesiege/main.ts:600](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:600)

   **Observed** (`rg`, `nl -ba`): `openPath()` still calls `os.proc.spawn("filemanager", [full])`. It and its helper chain have no retained callers. The ledger calls them “unused, old-OS file opening” ([ledger:563](/Users/rargu/DevPageOS/docs/ledger/2026-10-24-spec-007.md:563)).

   CastleSiege also retains `playSfx()` behind `os.sys.sound.enabled()`, while the only retained host returns `false` ([os.ts:232](/Users/rargu/DevPageOS/src/sheet/host/os.ts:232)).

   **Derived:** the owner’s S2 cleanup remains incomplete. These paths serve no sheet behavior.

   **Fix:** remove the unused file-opening helpers and unreachable sound-effect path. Remove resources used only by those paths.

**Other observed checks:** `git diff`, `git ls-tree`, and `git rev-parse` confirm that the deletion counts match the inventory and the tag points to the switch commit’s parent. A read-only TypeScript import scan found no unresolved local imports across 256 tracked files. I found no inverted `onSheet` branch.

In-memory guard calls rejected a missing entry, a forbidden kernel module, and a 113.2 KiB shell. With filesystem writes replaced by memory capture, the icon generator produced exactly 65 retained paths, all byte-identical to committed assets. Stub calls handled failed deploys, partial deploys, failed version reads, and failed rollbacks.

I found no current routing-order defect. Explicit redirects precede asset handling, and `/resume.html` → 307 `/resume` matches Cloudflare’s documented behavior. [Redirect rules](https://developers.cloudflare.com/workers/static-assets/redirects/), [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/). Diff inspection found no new dependencies, server code, third-party requests, secrets, fixed sleeps, or reduced-motion changes.

**Verdict:** Fix 1–5 before marking 007 verified locally.

**Not checked:** I ran no build, lint, test pipeline, browser, deploy, or live-site check. R8 results, visual comparisons, and clean-checkout results remain ledger evidence, not independently repeated results. Real Cloudflare version reads and rollback remain **Unverified**. I modified no files.
## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first: AGENTS.md; docs/specs/007-switch-over/spec.md (all, incl. "Owner decisions" of 2026-10-24) and tasks.md; docs/review/spec-007-critique-codex.md; docs/ledger/2026-10-24-spec-007.md (T1 inventory, T2–T9: what each task did and its checks); docs/review/spec-007-mock-vs-build.md.

The change under review: spec 007's implementation, `git diff 1d43e88..d626794` (T2 commit 580165c: test base path; switch commit d626794: T3–T9). The local tag `devpageos-final` is on 580165c. Most of the diff is deletions of the old OS: check the delete list against the inventory and that nothing retained depends on a deleted file, but spend most time on added/modified files: `git diff --diff-filter=AMR 1d43e88..d626794 -- src scripts tests vite.config.ts package.json package-lock.json public playwright*.ts wrangler.jsonc index.html`, plus README.md, AGENTS.md, docs/README.md.

Check: (1) every requirement R1–R9 (R10–R13 are owner-gated, not done) against code and a test that can fail; R3: the guard and budget still fail when they should (missing index entry, forbidden import fixture, shell > 100 KiB); (2) phase B of T3 (owner decision S2: old-OS-only code paths cut from Paint, Tracker, Writer, CastleSiege, src/apps/lib): any sheet behaviour changed, any branch removed that the sheet still used, any dead code left that the owner asked to cut, any `onSheet`-guarded logic inverted; (3) routing: public/_redirects order and semantics on Cloudflare Workers static assets (html_handling auto-trailing-slash), 301 vs 307, the 404; tests/e2e/routing.spec.ts runs against local wrangler only; (4) scripts/deploy-live.ts: the version-id read, rollback logic, the dry-run stub really cannot spawn processes or reach the network, the real path needs an explicit flag, failure modes (deploy fails, partial deploy, rollback fails), and consistency with _redirects; (5) names (R6): head tags, escaping of the tagline, package names, no visitor-visible DevPageOS; (6) scripts/gen-icons.ts: writes only retained paths; (7) tests that cannot fail, fixed sleeps, tests retired that still covered retained code; (8) rules: static site, no third-party requests, no secrets, no new dependencies, prefers-reduced-motion.

Constraints: read-only commands only (no build, no test runs that write files).

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence (quote), why it is wrong against which requirement, and a fix. Keep observed facts apart from inference. End with a verdict and what you could not check.
