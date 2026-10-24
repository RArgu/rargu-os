---
name: spec-driven
description: >
  DevPageOS's required workflow for any change to site code, build config, scripts, content structure or deploy:
  write a spec in docs/specs/, get an independent critique, get owner approval, then tasks, implementation and
  verification. Use when starting such a change, when asked to "spec", "plan" or "propose" one, or before writing
  code. Not for typo/link fixes, content-only Markdown edits, or read-only research.
---

<!-- Ported from RETVController (written there 2026-10-13) on 2026-10-22, adapted for a static web site: device gates
became deploy gates, emulator/hardware levels became unit/e2e/preview/live. Ideas there were adapted (paraphrased, no
text copied) from MIT-licensed addyosmani/agent-skills (spec-driven-development), github/spec-kit and
Fission-AI/OpenSpec; the questioning rules live in the interview skill. -->

# Spec-driven development

The spec is the contract between the agent and the owner: what changes, why, how we'll know it worked, and what is
off-limits. No code before an approved spec. Keep specs short; a small change gets a small spec, never none.

## Where things live

- `docs/specs/README.md`: index of every spec with its status, plus the owner's current critic choice.
- `docs/specs/NNN-slug/spec.md` and `tasks.md`: one folder per change. Templates are in this skill's `templates/`.
- `docs/mockups/`: approved HTML mocks. A mock is the layout baseline for UI specs (see `compare-vs-mock`).
- `docs/OWNER_QUESTIONS.md`: owner decisions made outside a spec.
- `docs/review/`: critic output with provenance and dispositions.
- `docs/ledger/`: one file per session with the commands run and their results.
- Living docs (`README.md`, `docs/README.md`) describe the current truth. A spec proposes a change to them; archiving
  the spec updates them.

## Status lifecycle

`Draft → Critiqued → Approved → Implementing → Verified (local) → Verified (live) → Archived`, or `Blocked` with the
reason. Only the owner moves a spec to `Approved`. `Verified (live)` needs the deploy gate.

## Evidence labels

- **[Prop]** proposed, not built.
- **[Code]** read in the code (cite `path:line`).
- **[Test]** shown by a passing test (name the test and the command).
- **[Live]** seen on rargu.dev (date and how).

## Verification levels

- **unit**: `npm test` (Vitest).
- **e2e**: `npm run e2e` (Playwright, Chromium desktop + phone emulation); `npm run e2e:all` adds Firefox and WebKit.
- **preview**: `npm run build && npm run preview`, checked in a browser by the agent or the owner.
- **live**: rargu.dev after a deploy.

## Gates

- **G-deploy:** `npm run deploy` (Cloudflare, rargu.dev). Owner approval every time, never implied by spec approval.
- **G-push:** pushing to GitHub or opening a PR. Ask first.
- **G-net:** any network call from the site to a third party (APIs, analytics, fonts from a new host). Ask first.

## Steps

0. **Scope check.** If the request bundles capabilities that could ship and be verified separately, propose a split
   (a short table: id, what, depends on) and stop for the owner before writing specs.
1. **Specify.** Copy `templates/spec.md`. List your assumptions first. Number requirements `R1…`. Each gets
   Given/When/Then acceptance, an evidence label, a verification level and the gate it needs, if any. Mark what you
   don't know as **Unverified** or `NEEDS OWNER`; never fill gaps from memory. Settle every `NEEDS OWNER` with the
   `interview` skill. Fill in Always / Ask first / Never. Add the spec to the index as `Draft`.
2. **Critique.** Run the independent read-only critic named in the index (`codex` skill). Save its output with
   provenance to `docs/review/`, check each finding against the files, record a disposition (accepted / partly /
   rejected and why), revise, and set `Critiqued`.
3. **Owner review.** Present the spec and end the turn. Record the approval in the spec (date, scope, decisions).
   Approving a spec never approves a gate.
4. **Tasks.** Copy `templates/tasks.md`. Each task: the R-ids it serves, acceptance, how to verify, files touched
   (about five at most), ordered by dependency.
5. **Implement.** One task at a time, following the `ponytail` skill (smallest complete change). If a decision or
   requirement must change, update the spec first; a changed requirement, boundary or gate needs re-approval.
6. **Verify.** Run each requirement's verification at its stated level. Record commands and results in the session's
   file in `docs/ledger/`. Label a result by where it actually ran (Chromium e2e is not Safari).
   Tests that prove something: a new test fails on the old code first; timing is deterministic (wait on events or
   fake timers, not sleeps); test through the real entry (the page, the pointer events, the public module API), not
   helpers. For UI work, also run `compare-vs-mock` against the approved mock before showing the owner.
7. **Archive.** Update the living docs to match what was built, set `Archived`, and keep the folder.

## Red flags

- Writing code, or starting a plan, in the same turn the spec is first presented.
- A requirement with no acceptance check, or a check that can't fail.
- "Done" or "verified" without saying where it was verified.
- A deploy, push or new network call that is not tied to an owner approval.
- A spec that has drifted from the code it describes.
