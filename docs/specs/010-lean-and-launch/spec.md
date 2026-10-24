# 010: Held lean back, 404 tip removed, public repo, deploy, merge

**Status:** Implementing · **Owner approval:** 2026-10-24 · **Gates needed:** G-deploy (R5, given 2026-10-24 for the
release SHA that passes R7), G-push (R4, given 2026-10-24: create public `RArgu/rargu-os` and push `main`; fresh history, site files only)
**Related:** 009 R2 (replaced by R1 here), 009 R3 and R6.d (amended), 007 R11/R12 and T11–T13 (order amended by
R8), OWNER_QUESTIONS 2026-10-24 "Wobble and held drag", morning report 2026-10-24,
[critique](../../review/spec-010-critique-codex.md).

## Why

The owner answered the morning report and the 007 T11 preview on 2026-10-24. They want the held lean back (the window
leans while you hold it), but not the grow to 103 %. They want the long tip line off the 404 page. The GitHub repo
that the site links to does not exist, so they chose to create a public repo `rargu-os`. They gave G-deploy for the
commit that passes all checks, and chose a fast-forward of `main`. The landing wobble stays as 009 set it until the
owner has mocked it in Blender.

## Assumptions

1. The pre-009 lean is the target: `swayTarget(t) = clamp(−0.012·t, −12°, 12°)` on the pointer's torque, held
   ζ = 0.65, ω = 2π·2.6 (`git show dcd5293^:src/sheet/physics.ts`). [Code] The owner felt it on the 007 T11 preview.
2. With 009's per-motion `will-change: transform`, a rotating held window is a composited layer, so the lean adds few
   Paint events. **Unverified**: R3 measures it.
3. `#tip` is the digits' `aria-describedby` (`public/404.html:293`). The owner objects to the visible line, so a
   visually hidden hint stays for screen readers. **Inferred.**
4. The history that `main` would publish holds private material: private artifact links and session ids in docs
   (critique finding 2), the owner's session logs (`plan/PROGRESS.md`, 19 MB), and 113 MiB of Castle Wars art
   candidates (`design/battler`). No secret pattern and no `art-source/` path matched (grep, 2026-10-24). [Observed]
5. No git remote exists and `RArgu/rargu-os` does not exist (`git remote -v`, `gh repo list RArgu`). [Observed]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | While held, a window leans about the grab point as before 009: target θ = clamp(−0.012·torque(arm, release velocity), −12°, 12°), held ζ = 0.65, ω = 2π·2.6. When the lean settles, θ = θ′ = 0 exactly. No scale (1). The 404 digits lean the same way. Kick 2.5°, free ζ 0.45, throw and Home math stay as 009. Reduced motion: no lean (001 R17). The 009 R1 layer hint stays while held and is removed at rest. Replaces 009 R2. | [Prop] | unit + e2e | — |
| R2 | The 404 page shows no tip line. A visually hidden element keeps the digits' key hint: "Arrows move it. Enter or Space throws it. Home brings it back." Amends 009 R6.d. | [Prop] | unit + e2e | — |
| R3 | 009 R4 still holds with the lean: a scripted drag costs ≤ 150 Paint events (Chromium). | [Prop] | e2e (Chromium) | — |
| R4 | A public GitHub repo `RArgu/rargu-os` exists and `origin` points to it. Its `main` is a new history: one root commit whose tree equals the release SHA's tree. The release commit stops tracking `design/`, `plan/`, `tools/`, `docs/archive/` and `docs/handoffs/` (files kept on disk, added to `.gitignore`). `content/identity.json` `repoUrl` and `content/README.md` name it. The `devpageos-final` tag is not pushed. | [Prop] | review | G-push (given) |
| R5 | The release SHA is deployed with `npm run deploy:live` from a clean checkout of that SHA. 007 becomes `Verified (live)` only on success. | [Prop] | live | G-deploy (given) |
| R6 | `main` moves to the release SHA by fast-forward only; that full history is then kept as the local branch `main-full-history`, and local `main` becomes the public root commit tracking `origin/main`. | [Prop] | review | — |
| R7 | All suites pass on the release SHA with a clean tree: `npm run lint`, `npm test`, `CI=1 npm run e2e:all`, `CI=1 npm run e2e:routing`; budget OK. | [Prop] | unit + e2e | — |
| R9 | The live same-origin check (`tests/e2e/sheet.spec.ts`, 001 R2.a, `@live`) accepts Cloudflare Web Analytics, which Cloudflare adds at the edge: `https://static.cloudflareinsights.com/beacon.min.js…` and `https://cloudflareinsights.com/cdn-cgi/rum`. Every other request stays same-origin. The site code adds no network call. Amendment 1. | [Prop] | e2e + live | G-net (given 2026-10-24) |
| R8 | Release order: all code, content and spec docs are committed first as the release SHA; R7 runs on it; then R6, R4, R5 on that same SHA. Ledger and status commits after R5 are evidence only and are pushed after the deploy (same G-push). Amends 007 T12/T13. | [Prop] | review | — |

### Acceptance

- **R1.a** Unit: `swayTarget` has the pre-009 formula and clamp; `swing(s, dt, true, target)` moves θ toward `target`
  with ζ = 0.65 and returns `{th: 0, v: 0}` once |θ − target| < 0.05° and |θ′| < 0.5 °/s with target 0. The 009 R3.a
  fixtures (start at rest, free swing) pass unchanged.
- **R1.b** E2E (Chromium, Firefox, WebKit): a window grabbed off centre on the title bar and moved in 20 steps at
  about 600 px/s, with frames between steps, has |θ| > 0.5° on some sample; the grab point stays within 1 px of the
  pointer; scale is 1 on every sample. After the pointer is still, θ reaches exactly 0 and the loop stops (001 R22.a
  idle check). Fails on HEAD (θ = 0).
- **R1.c** Reduced motion, both implementations (sheet and 404): on from the start, a held move has θ = 0 on every
  sample; switched on during a visible lean, θ goes to 0 at once, the pointer is still tracked, there is no lean
  after, and no animation frame is pending when idle (except sheet edge scroll).
- **R1.d** 404 page, unit behaviour fixture through the real pointer handlers with frames advanced between inputs:
  an off-centre grab moved diagonally has |θ| > 0.5° and scale 1; a centre grab has θ = 0. The routing e2e touch drag
  grabs off centre and checks |θ| > 0.5° and scale 1. The constants test covers `ZETA_HELD` and the clamp.
- **R1.e** Cancel at rest: hold, move, stand still until the loop stops, then window blur, `pointercancel` and lost
  capture (each case): position unchanged, θ = 0, and `will-change` empty within one frame. While held,
  `will-change` is `transform`.
- **R1.f** The 009 landing limits (throw peak ≤ 2.5°, settle from 0.8 s) are measured from the pin onward
  (`tests/e2e/sheet-windows.spec.ts:800-818` now counts from the press). The held zero-rotation checks (`flat(p)`
  at `:403` and similar) become "scale 1 and grab point on the pointer".
- **R2.a** Unit: no element holds the old sentence; each digit's `aria-describedby` names the hidden hint element;
  gzip ≤ 8 KiB.
- **R2.b** E2E at 390 × 844 and 1440 × 900: the hint element is visually hidden (1 × 1 px clip, or equal); all three
  digits keep `toHaveAccessibleDescription` with the new text (`tests/e2e/routing-404.spec.ts:145` updated); with JS
  off the digits are plain text and no hint is announced.
- **R3.a** `tests/e2e/drag-perf.spec.ts` passes; the Paint count goes in the ledger.
- **R4.a** Before the push, on the refs to publish only: a secret scan (gitleaks if installed, else the grep set in
  the ledger), a list of paths and blobs > 1 MB, `.claude/` paths limited to the `.claude/skills` symlinks (mode
  120000), and a check of current files and commit messages for private links, session ids and local setup details.
  On any hit not covered by the owner's R4 answer: stop and ask.
- **R4.c** `git diff --stat <release SHA> main` is empty (same tree); `git ls-files` has no path under the five folders; the files are still on disk.
- **R4.b** `git remote get-url origin` is `https://github.com/RArgu/rargu-os.git`; `gh repo view RArgu/rargu-os
  --json visibility` is `PUBLIC`; `git ls-remote origin` shows `main` at the published SHA and no tags.
- **R5.a** The ledger has the release SHA, the previous Worker version id, the deploy output, the new version id and
  the live check results; on failure, the rollback result.
- **R9.a** The check fails on a request to any other third-party origin or path (for example
  `https://static.cloudflareinsights.com/other.js`), and passes with the two beacon URLs (unit test of the filter).
  Locally (no beacon) it passes as before; live it passes with the beacon.
- **R6.a** The ledger records old `main` (`442672d`) and the 009 tip (`b7c33c8`); both are ancestors of the release
  SHA; `git merge --ff-only <release SHA>` on `main`; then `git rev-parse main` equals the release SHA.

## Approach

- `src/sheet/physics.ts`, `src/sheet/windows.ts`: restore `swayTarget`, `ZETA_HELD` and the held target from
  `dcd5293^`, with an exact zero at held rest. Keep `KICK` 2.5 and free ζ 0.45. Do not restore `LIFT`. The loop stays
  busy while a held window leans.
- `public/404.html`: the same held lean in its physics copy; animate held digits; remove the tip text; hidden hint.
- Tests first, seen failing: `tests/unit/physics.test.ts`, `tests/unit/page-404.test.ts`,
  `tests/e2e/sheet-windows.spec.ts`, `tests/e2e/routing-404.spec.ts`, `tests/e2e/sheet-a11y.spec.ts`.
- Docs (before the release SHA): 001 "Physics" held sentence, OWNER_QUESTIONS rows, 009 and 007 approval records,
  `content/identity.json`, `content/README.md`, spec index.
- Tasks: T1 lean (sheet) → T2 404 → T3 docs and content → T4 release SHA, R7 → T5 fast-forward → T6 R4.a scan, repo,
  push → T7 deploy → T8 evidence commit and push.
- **Rejected:** the 103 % lift (owner chose lean only); a new lean curve (owner asked for the old one).

## Boundaries

- **Always:** tests first; reduced motion; static site; record every gate action in `docs/ledger/`.
- **Ask first:** pushing the tag; landing wobble changes (owner will mock it in Blender); a new dependency.
- **Never:** push before R4.a is clean; deploy a SHA other than the one that passed R7; touch `art-source/` or commit
  `.claude/` local files.

## Out of scope

- Landing wobble changes. Fable's optional items (idle paints at zoom ≠ 100 %, 50 ms pickup frame).

## Open questions

- None. R4 settled 2026-10-24: "Fresh history, site only". `tools/` (the Castle Wars art pipeline, not used by the
  build) was added to the four named folders as "not site" (lead decision, listed in the report).

## Critique

`docs/review/spec-010-critique-codex.md`: 2 High, 5 Medium, 1 Low. All accepted.

## Approval record

2026-10-24 — Owner answers (this session): 404 "Remove [the tip line] … the other one looks good"; "G-deploy OK";
merge "I'll take your suggestion" (fast-forward); morning report 1 "We want the tilt back", 2 "revisit later, mocking
in Blender first", 3–7 "Good"/"Correct". Choices: "Lean only, no grow", "Deploy after checks pass", "Create public repo
rargu-os". Then "Fresh history, site only (Recommended)" and spec 010 "Approve".

2026-10-24 — **Amendment 1 (R9), G-net.** Deploy attempt 1 rolled back: the live check found
`static.cloudflareinsights.com/beacon.min.js`, which Cloudflare Web Analytics adds at the edge. Owner chose "Allow
the beacon" (over turning analytics off). This approves that one third-party call; no other.
