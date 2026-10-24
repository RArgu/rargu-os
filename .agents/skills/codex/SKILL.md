---
name: codex
description: >
  Run the OpenAI Codex CLI from Claude Code as a second agent: an independent read-only review or critique (the
  default), or, only when the owner asks, a delegated task. Use for spec critiques and implementation reviews
  (spec-driven steps 2 and 6), "/codex", "ask Codex", "get a second opinion" or "have Codex review/build this".
---

<!-- Ported from RETVController (written there 2026-10-14) on 2026-10-22. Ideas (no text copied) from
openai/codex-plugin-cc (Apache-2.0, read-only default, stop after findings) and cathrynlavery/codex-skill (MIT,
prompt template, re-verify the answer); flags from `codex exec --help`. -->

# Codex

Codex is the independent critic (docs/specs/README.md). Independence is the point: give it the files and the
question, not your conclusions.

## Command

Run from the repo root, in the background (`run_in_background`), with every part below. Expect 2–15 minutes.

```sh
OUT=<scratchpad>/codex-<slug>
/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config \
  -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never \
  -o "$OUT.md" "$(cat "$OUT.prompt.md")" < /dev/null > "$OUT.stdout" 2> "$OUT.stderr"
```

- `< /dev/null` is required. Without it a background run hangs on stdin.
- Read `$OUT.md` (the final message). Do not read `$OUT.stderr` whole, it is large. Take only the session id and
  the token count: `grep -m1 'session id' "$OUT.stderr"; grep -A1 'tokens used' "$OUT.stderr"`.
- Model and CLI path: from docs/specs/README.md. If that file names a different critic, follow it.

## Prompt

Write the prompt to `$OUT.prompt.md`:

1. **Role:** "You are an independent read-only reviewer for DevPageOS (the RArgu OS site). Do not modify files."
2. **Read first:** `AGENTS.md`, the spec, the approved mock if it is a UI spec, and the exact files or commit range
   (`git diff A..B`).
3. **Task:** one question. For a review: correctness, spec drift, accessibility, performance, missing tests.
4. **Constraints:** paste the relevant AGENTS.md rules and owner decisions (Codex does not read memory). No network
   actions, no deploys.
5. **Answer format:** findings ordered by severity (High/Medium/Low), each with `path:line`, the evidence, and a fix.
   Keep observed facts apart from inference. End with what it could not check.

## After the run

- Check every finding against the files yourself before you accept it. Codex can be wrong too.
- Save the output verbatim to `docs/review/<spec>-<kind>-codex.md` with a provenance header: CLI, model, effort,
  sandbox, session id, tokens, date, commit range. Then add a disposition per finding (accepted / partly / rejected,
  and why).
- **Stop after you present the findings.** Do not apply fixes from a review until the owner or the spec allows it. A
  fix that changes an approved requirement needs the owner first.
- On failure or timeout: report it and retry with a narrower prompt. Do not replace Codex's review with your own.

## Delegated tasks (write mode)

Only when the owner asks Codex to build a named task. Ask first, every time.

- Use `-s workspace-write`. Never `danger-full-access`, `--dangerously-bypass-approvals-and-sandbox` or
  `--full-auto`.
- Start from a clean `git status`. Review the whole diff as you would any change, then run the tests.
