# AGENTS.md

Rules for coding agents (Claude Code, Codex) in this repo. The owner is Rodrigo Arguello (GitHub: RArgu).

## What this repo is

The personal site at rargu.dev: **RArgu OS**, one pannable, zoomable blueprint sheet with live project windows that
visitors can throw around (see `README.md`). The approved layout is the mock in `docs/mockups/`
(`docs/mockups/README.md` names the current file). Owner decisions are in `docs/OWNER_QUESTIONS.md`. The old browser
OS (DevPageOS) is in the local tag `devpageos-final`, and its docs are in `docs/archive/`. `docs/archive/`,
`docs/handoffs/`, `design/`, `plan/` and `tools/` are local only (git-ignored, spec 010): never add them to git.

## Workflow

- Every change to site code, build config, scripts, content structure or deploy follows the `spec-driven` skill:
  spec in `docs/specs/` → independent critique (`codex` skill) → owner approval → tasks → implementation (`ponytail`)
  → verification → archive. Not needed for typo/link fixes or content-only Markdown edits.
- Settle open decisions with the `interview` skill. Write every reply, spec and handoff with the `ste` skill.
- UI work: `better-ui` for polish values, `compare-vs-mock` before showing the owner. Reviews: `ponytail-review`.
- Skills live once in `.agents/skills/` (read by Codex). `.claude/skills/<name>` are symlinks to them for Claude
  Code. Edit the files in `.agents/skills/`.

## Claim labels

Say where each claim comes from: **observed** (you ran it or saw it, give the command), **derived** (follows from
observed facts), **inferred** (a guess with reasons), or **Unverified**. Cite `path:line` or the URL.

## Always / Ask first / Never

- **Always:** run `npm run lint`, `npm test` and the relevant `npm run e2e` before saying a code task is done. Keep
  the site static (no server code) unless a spec says otherwise. Respect `prefers-reduced-motion`.
- **Ask first:** `npm run deploy` or `npm run deploy:live` (G-deploy), `git push` or a PR (G-push), any new network
  call from the site (G-net), adding a dependency.
- **Never:** commit `art-source/` (source art, kept out of git by owner decision 2026-10-22) or `.claude/` local
  files. Put secrets or API keys in the repo or the client bundle. Deploy without the owner's OK.

## Commands

`npm run dev` · `npm run build` · `npm run preview` · `npm run lint` · `npm run format` · `npm test` ·
`npm run e2e` · `npm run e2e:all` · `npm run e2e:routing` · `npm run image` · `npm run gen:assets` ·
`npm run deploy` and `npm run deploy:live` (both gated, G-deploy). Node 22.18+.

## Licenses

`ponytail`, `ponytail-review` (DietrichGebert/ponytail, MIT) and `better-ui` (jakubkrehel/skills, MIT) are vendored
with their LICENSE files. The other skills are the owner's own, ported from RETVController on 2026-10-22.
