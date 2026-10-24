# Spec 004 T2 and T3: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only
- **Session id:** 01a16a9d-b791-70f0-afb8-9034e9bdb345 · **Tokens:** 189,000
- **Date:** 2026-10-24 · **Scope:** committed range `dfe4abd..970973b`
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | R2 reachability check skips controls inside scrolling panels | Accepted (test fix). Fixed in T7 (`be4e96d`). |
| 2 | The phone Wallpaper assertion cannot fail on the sheet (host is desktop policy) | Accepted (test with a compact-policy fixture of Paint, or drop the claim). Fixed in T7: test-build `?policy=compact` fixture. |

## Codex output (verbatim)

Reviewed `dfe4abd..970973b` only. No High findings or direct T2/T3 behavior defect found. Two test-coverage findings follow.

1. **Medium — R2’s check can pass with unreachable controls.** [tests/e2e/quick-tools.spec.ts:155](/Users/rargu/DevPageOS/tests/e2e/quick-tools.spec.ts:155)

   **Observed** (`git show 970973b:tests/e2e/quick-tools.spec.ts`): the check skips zero-size controls and every control with a scrolling ancestor: `"if (scroller) continue;"` at line 163. Tracker’s instrument panel has `"overflow-y: auto"` at [src/apps/tracker/styles.css:112](/Users/rargu/DevPageOS/src/apps/tracker/styles.css:112).

   **Derived:** hidden controls, or controls clipped inside that panel, can escape this check. Empty root overflow and an empty `clipped` list do not establish R2/T2’s “every control is reachable.”

   **Fix:** assert that expected controls exist and are visible. For scrolling controls, scroll them into view and verify their visible bounds against clipping ancestors.

2. **Low — The phone Wallpaper assertion cannot detect a broken removal.** [tests/e2e/quick-tools.spec.ts:293](/Users/rargu/DevPageOS/tests/e2e/quick-tools.spec.ts:293)

   **Observed** (`git show`): the test claims to check the “phone toolbar Wallpaper button” through `getByText(/Wallpaper/i)`. The host fixes `DISPLAY_POLICY` to `"desktop"` at [src/sheet/host/os.ts:208](/Users/rargu/DevPageOS/src/sheet/host/os.ts:208). Paint attaches its bottom toolbar only in the compact branch at [src/apps/paint/main.ts:700](/Users/rargu/DevPageOS/src/apps/paint/main.ts:700).

   **Derived:** restoring the toolbar’s Wallpaper item would leave this assertion green. It does not verify that part of R8.

   **Fix:** test Paint with `DISPLAY: "sheet"` and `DISPLAY_POLICY: "compact"`. First assert that New/Open/Save appear, then assert that Wallpaper does not.

**Other source checks:** the rectangles match the approved values. Title edits preserve filenames and modified markers. Retained menus match T1. Help keeps one About action through rebuilds. The shared helper preserves other old-OS callers’ behavior: their environment has no `DISPLAY` marker ([src/kernel/kernel.ts:561](/Users/rargu/DevPageOS/src/kernel/kernel.ts:561)). These conclusions are **derived from source**, not runtime results.

The revised minimap, Alt+arrow edge, card-home, Song-menu scrolling, 80% start-set, and host-proc checks retain meaningful assertions. The diff adds no dependencies, storage, or third-party requests.

**Could not check:** actual rendering, control reachability, About dialogs after rebuilds, or browser regressions. Per your constraints, I ran no tests, build, lint, browser, or network commands. No files changed.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first: AGENTS.md; docs/specs/004-quick-tools/spec.md (all, incl. "Owner decisions after T1") and tasks.md (rows T2, T3); docs/review/spec-004-critique-codex.md; docs/ledger/2026-10-23-spec-004.md; docs/specs/002-app-host/spec.md "Lead notes"; docs/mockups/README.md (v0.7 approved).
The change under review: committed range `git diff dfe4abd..970973b` (004 T2 layout and T3 sheet titles/removed items/About). Read every changed file (src/sheet/layout.ts, src/apps/lib/open.ts, src/apps/paint/main.ts, src/apps/tracker/main.ts, src/apps/writer/main.ts, tests/e2e/quick-tools.spec.ts, and the updated tests). Ignore the uncommitted working tree (other tasks are in progress).

Task: review T2 and T3. Check: (1) R1/R1.a titles (format, modified marker, file name) and R2/R2.a rectangles, client sizes, reachability; (2) R3 retained menus and R8 removed items are exactly right per the spec and the T1 list; Help = About only, opening after a rebuild; (3) every change gated on os.env.DISPLAY === "sheet" and the old OS unchanged (R14); helpers in src/apps/lib/open.ts used by other old-OS apps — any behaviour change for them?; (4) the updated older tests keep their intent (sheet minimap, a11y Alt+arrow edge, card homes, host-input Song menu, host-load 80 % zoom start set, host-proc R10.a); (5) tests that cannot fail.
Constraints: static site, no third-party requests, no storage, no new dependencies. Read-only commands only; no tests, no network.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, evidence (quote), why it is wrong against which requirement, and a fix. Keep observed facts apart from inference. End with what you could not check.
