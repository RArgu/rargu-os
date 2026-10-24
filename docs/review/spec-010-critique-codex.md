# Spec 010 critique (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config`, read-only, ephemeral
- Model: gpt-6.1-sol, reasoning effort high
- Session id: 01a16eb0-805b-7db3-abd2-9f83744056dd · tokens used: 243,876
- Date: 2026-10-24 · Spec: `docs/specs/010-lean-and-launch/spec.md` (Draft) at HEAD `b7c33c8`

## Dispositions

| # | Severity | Disposition | Why |
|---|---|---|---|
| 1 | High | Accepted | `scripts/deploy-live.ts:156` runs `npm run deploy` on the working tree. Release SHA defined; docs before checks; evidence commits after. |
| 2 | High | Accepted | Checked: `docs/handoffs/MORNING_REPORT_2026-10-23.md:27-32` (private artifact links), `docs/archive/castlewars/reports/stage-i/OCTOBER-6-STAGE-I-CHECKLIST.md:59` (session ids, local setup). History also has 113 MiB of Castle Wars art candidates (`design/battler`). Publication is an owner decision (R4 now NEEDS OWNER). |
| 3 | Medium | Accepted | Held rest now sets θ = θ′ = 0 exactly; cancel tests added (R1.e). |
| 4 | Medium | Accepted | `tests/e2e/routing-404.spec.ts:285` grabs the centre (zero torque). Off-centre grab specified. |
| 5 | Medium | Accepted | Live reduced-motion switch during a hold added for both implementations (R1.c). |
| 6 | Medium | Accepted | `tests/e2e/sheet-windows.spec.ts:800-818` measures from the press. Wobble limits measured from the pin (R1.f). |
| 7 | Medium | Accepted | R6.a rewritten: ancestors recorded, `git merge --ff-only`. |
| 8 | Low | Accepted | R2 checks the hidden hint and the accessible description. |

## Codex output (verbatim)

1. **High — The release order does not preserve the checked commit.**  
   `docs/specs/010-lean-and-launch/spec.md:79`

   **Observed** (`nl -ba`): T4 changes docs and repo text after T3 runs R7. `content/identity.json:12` supplies the site’s repo link. `scripts/deploy-live.ts:156` invokes `npm run deploy`, which rebuilds the current working tree (`package.json:21`). It neither selects nor verifies a Git commit.

   **Derived:** Following the stated order can push and deploy content that did not pass R7. Later ledger and status commits also make “final commit” ambiguous.

   **Fix:** Complete all release content and docs first. Commit a named release SHA, then run R7 on that clean revision. Fast-forward, push, and deploy that same SHA. Record it beside the Worker version IDs. Define later evidence-only docs commits separately, including whether they receive another push. Explicitly amend 007 T12/T13 to this sequence.

2. **High — The public-history gate does not cover private material.**  
   `docs/specs/010-lean-and-launch/spec.md:59`

   **Observed** (`rg`, `nl -ba`): `docs/handoffs/MORNING_REPORT_2026-10-23.md:27` contains artifact links explicitly called private at line 32. `docs/archive/castlewars/reports/stage-i/OCTOBER-6-STAGE-I-CHECKLIST.md:59` records local settings, account status, and session details.

   **Inferred:** The owner may want some of this information excluded. A secret-pattern search cannot settle that decision. These observations do **not** establish a credential leak.

   **Observed** (`git rev-list --objects HEAD` and `git cat-file --batch-check`): reachable blobs total about 233 MB. The largest is 2,356,647 bytes. No `art-source/` path appeared in that inventory. Withholding `devpageos-final` still publishes its ancestor history.

   **Fix:** Add a publication review of current files, historical docs, commit messages, and binary assets. Name the secret scanner, configuration, coverage, and handling of findings. Cover merge resolutions and all objects reachable from the release SHA. Inventory large blobs and verify historical `.claude/skills` exceptions by file mode. Confirm public visibility separately from remote access.

   Scope blocking checks to the refs being published. The current `--all` scan also finds a regular `.claude/skills/sprite-partmap/SKILL.md` on an unrelated local branch (`git log --all`, `git ls-tree 986f9d6`).

3. **Medium — Settling acceptance misses a retained layer hint after cancellation.**  
   `docs/specs/010-lean-and-launch/spec.md:50`

   **Observed** (`git show dcd5293^:src/sheet/physics.ts`, `git show dcd5293^:src/sheet/windows.ts`): the old held loop stops below angle and velocity thresholds without setting both values to zero. Current cancellation does not restart that loop (`src/sheet/windows.ts:223`). The layer hint remains whenever either value is nonzero (`src/sheet/windows.ts:88`).

   **Observed** (`node --input-type=module -e …`): a numerical probe of the old equation and stopping condition ended with θ ≈ 0.00286° and velocity ≈ 0.464°/s.

   **Derived:** Restoring only the proposed busy condition can pass the `< 0.05°` acceptance. A later cancellation can leave that residual angle and `will-change` indefinitely.

   **Fix:** Define an exact resting state. Test movement, stationary hold, stopped animation loop, then blur, cancel, and lost capture. Require unchanged position, zero rotation, and eventual hint removal. Keep the hint while held. Advance frames with a controlled clock, without fixed sleeps.

4. **Medium — The proposed 404 touch assertion uses a zero-torque grab.**  
   `docs/specs/010-lean-and-launch/spec.md:52`

   **Observed** (`nl -ba`): the existing touch test grabs the digit’s center (`tests/e2e/routing-404.spec.ts:285`). R1 computes torque from the center-to-grab arm. A center grab makes that arm zero.

   **Observed** (`node --input-type=module -e …`): `torque([0, 0], [-360, 720])` returns zero.

   **Derived:** Merely replacing “translate only” with a positive-rotation assertion rejects correct physics. The existing unit drag fixture also advances timestamps without animation frames (`tests/unit/page-404.test.ts:405`).

   **Fix:** Specify an off-center grab and movement direction. Advance animation frames between inputs. Assert a nonempty sample has `|θ| > 0.5°`, scale stays 1, and the grab point follows the pointer. Retain a center-grab fixture expecting zero lean.

5. **Medium — Reduced-motion acceptance omits preference changes during held lean.**  
   `docs/specs/010-lean-and-launch/spec.md:51`

   **Observed** (`nl -ba`): R1.c names only a held move. Existing 404 preference-change fixtures cover flight and wobble (`tests/unit/page-404.test.ts:448`). Its current animation loop skips held digits entirely (`public/404.html:351`).

   **Derived:** Adding held animation creates a new path that those fixtures do not exercise. A sheet-only test could also leave the separate 404 implementation incorrect.

   **Fix:** Explicitly cover both implementations with reduced motion enabled initially and enabled during a visibly leaning hold. Require immediate zero rotation, continued pointer tracking, and no subsequent lean. Require animation callbacks to stop when idle, except necessary sheet edge scrolling.

6. **Medium — The retained wobble test measures the restored held lean against the landing limit.**  
   `docs/specs/010-lean-and-launch/spec.md:35`

   **Observed** (`nl -ba`): `tests/e2e/sheet-windows.spec.ts:800` records from the press. Its maximum-angle assertion includes all those frames (`:816`), although 009 defines timing from the pin.

   **Derived:** Correct held lean can exceed 2.5° and fail this retained test before landing. Existing grab-point tests also require `flat(p)` (`tests/e2e/sheet-windows.spec.ts:403`).

   **Fix:** Name these amended expectations. Measure landing-wobble limits from the pin onward. Keep the zero-initial-state 009 unit fixtures and exact kick/free-damping checks. Retain pointer accuracy and scale checks while replacing held zero-rotation assertions.

7. **Medium — R6.a does not prove a fast-forward or the required lineage.**  
   `docs/specs/010-lean-and-launch/spec.md:66`

   **Observed** (`nl -ba`): once `main` equals HEAD, `git log --merges main..` is empty regardless of how `main` moved.

   **Observed** (`git merge-base --is-ancestor main HEAD`, exit 0): today’s `main` is an ancestor. `git rev-list --count main..HEAD` reports 303 commits. That range already contains merge commit `a4129f6`.

   **Derived:** A reset to unrelated history could satisfy R6.a. Checking the range before advancing would instead reject an existing, accepted merge.

   **Fix:** Record the old `main` SHA and the starting spec-009 SHA. Require both to be ancestors of the release SHA. Advance `main` with `git merge --ff-only <release-SHA>`, then verify equality. “No merge commit” should mean no new merge created by this operation.

8. **Low — The tip acceptance can miss replacement text that remains visible.**  
   `docs/specs/010-lean-and-launch/spec.md:55`

   **Observed** (`nl -ba`): R2.b checks only for “Drag one.” Removing that phrase while displaying the shorter key hint satisfies this browser assertion. The existing browser accessibility assertion uses the old wording (`tests/e2e/routing-404.spec.ts:145`).

   **Fix:** Update and retain `toHaveAccessibleDescription` for all three digits. Add a browser check of the replacement hint’s visual hiding at both required sizes. Keep the no-JS plain-text behavior.

**Baseline assessment:** Read-only Node probes observed no exported `swayTarget`, a zero held response, and no 404 rotation during frame-paced movement. The 404 probe also observed the old tip as `display: block`. Thus the proposed positive-lean and tip-removal checks should fail current code. The reduced-motion and Paint checks are regression guards and need not fail initially.

**Could not check:** Browser rendering, actual Paint counts, full lint/unit/e2e results, exhaustive secret or privacy clearance, GitHub state, and live deployment remain unverified. Full test commands generate files, so I did not run them. I made no file changes, network actions, deploys, or Git writes.