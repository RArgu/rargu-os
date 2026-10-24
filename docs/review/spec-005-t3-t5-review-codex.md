# Spec 005 T3, T4 and T5: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a16875-3e0f-7663-b825-22b9fd1d3c38 · **Tokens:** 127,667
- **Date:** 2026-10-23 · **Scope:** uncommitted T3 + T4 (Castle Wars) and T5 (Pentimento) working tree against
  `3286309`, after the advisor's Pentimento height decision. One review: the tasks were built in parallel.
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Sprite requests can delay the start view (WebKit late-CSS fallback waits for `load`) | Accepted. View init waits for the stylesheet only. |
| 2 | Demo controls bypass the one-gesture owner (001 R21) | Accepted. |
| 3 | "SUMMER SALE" on the sample canvas is ~2.4–2.6:1 | Rejected. It is picture content (a sample image to edit) in the owner-approved mock colours, with a text description on the canvas; R18 is about the page's text. Listed for the owner. |
| 4 | Activation tests run after eligibility already mounted Castle Wars | Accepted. |
| — | No-JS text "Loading units…" forever (in "Other scope conclusions") | Accepted. Static "needs JavaScript" text. |
| — | Pentimento live reduced-motion change waits for the next step | Deferred to T6, as Codex notes. |

Also sent with the fixes: a WebKit failure in the lead's rerun (`pentimento.spec.ts:136`, canvas backing 1200 vs
expected 772: sized before the stylesheet applied).

## Codex output (verbatim)

1. **Medium — Sprite requests can delay the start view.** [src/sheet/demos/castlewars.ts:145](/Users/rargu/DevPageOS/src/sheet/demos/castlewars.ts:145)

   **Observed** (`nl -ba`): `seen.watch()` can mount Castle Wars during page initialization. Mount immediately calls `load()`, which assigns `img.src = u.frames.src`. Meanwhile, [view.ts:684](/Users/rargu/DevPageOS/src/sheet/view.ts:684) delays initialization when CSS is late:
   ```ts
   if (getComputedStyle(vp).position === "fixed") start();
   else addEventListener("load", () => { measure(); start(); }, { once: true });
   ```

   **Derived:** When WebKit takes this fallback, pending sprites can delay `load` and therefore the phone zoom and start framing. CSS can become ready while the view still waits for an unrelated image. A later `load` can also reset a view the visitor has already moved. This threatens 001 R15 and the advisor’s inset rules.

   **Fix:** Initialize the view when its stylesheet is ready, independently of sprite completion. Keep initialization once per page. Deferring sprite requests until after `load` also removes this dependency, but must preserve activation and pre-load button behavior. Add a test that delays CSS and holds one sprite, then checks phone framing before releasing the sprite.

   **Unverified:** I did not reproduce the WebKit timing in a browser.

2. **Medium — Demo controls bypass the one-gesture owner.** [src/sheet/demos/castlewars.ts:170](/Users/rargu/DevPageOS/src/sheet/demos/castlewars.ts:170), [pentimento.ts:94](/Users/rargu/DevPageOS/src/sheet/demos/pentimento.ts:94)

   **Observed** (`nl -ba`): Castle Wars directly handles button clicks:
   ```ts
   b.addEventListener("click", () => choose(b.dataset.anim!), { signal });
   ```
   Pentimento likewise starts a run without checking or claiming gesture ownership. `gestures.ts` recognizes only `"paper" | "win" | "map"`.

   **Derived:** A visitor can hold a title bar with one finger and activate a demo button with another. Conversely, holding a demo control does not prevent another finger from starting a paper pan. These are concurrent gestures under 001’s definition, which includes “input to a control inside a window.” They violate 001 R21.

   **Fix:** Include demo controls in the shared ownership rules. Reject conflicting pointer activation and release ownership on completion, cancellation, or blur. Preserve native keyboard clicks. Test both touch orders: window/paper first, and control first.

3. **Medium — Pentimento’s sample text fails the required contrast.** [src/sheet/demos/pentimento.ts:37](/Users/rargu/DevPageOS/src/sheet/demos/pentimento.ts:37)

   **Observed** (`nl -ba`):
   ```ts
   g.addColorStop(0, "#29adff");
   g.addColorStop(1, "#ff77a8");
   …
   x.fillStyle = "#fff1e8";
   x.fillText("SUMMER SALE", 28, 72);
   ```
   Read-only arithmetic with `python3 -B -c` gives approximately **2.37:1–2.59:1** at gradient positions behind the text. The new terminal pair passes at **12.15:1**.

   **Derived:** The sample text falls below even the 3:1 large-text threshold in 001 R18. The contrast test checks terminal colors and several window tokens, but omits this canvas text. The colors match the mock, so this is also a conflict between R18 and the mock appearance.

   **Fix:** Add a contrasting backing or outline that makes the text meet R18. Include the resulting pair in the contrast checks, and record the required visual correction during T7.

4. **Medium — Activation tests start after the activation behavior has already been bypassed.** [tests/e2e/castlewars.spec.ts:317](/Users/rargu/DevPageOS/tests/e2e/castlewars.spec.ts:317)

   **Observed** (`nl -ba`):
   ```ts
   const requests = await open(page);
   await loaded(page);
   // … activate by pointer, keyboard focus, and card navigation
   ```
   At the normal viewport, eligibility has already mounted Castle Wars before these actions.

   **Derived:** Removing the three activation listeners from `main.ts:141–143` would leave these activation assertions unaffected. The test protects repeated use after eligibility, but does not protect R3’s independent “or on activation” path.

   **Fix:** Start outside the expanded view. Exercise each first-activation path separately, and assert that loading starts before eligibility changes. For repeated activation, assert that the current animation state remains intact and one button press invokes one handler.

**Other scope conclusions**

- **Derived from source inspection:** Castle Wars has one timeout chain. Pause and visibility stops preserve each unit’s remaining frame time. Frame advancement uses the displayed frame’s JSON duration. Neither new demo schedules animation frames while idle.
- **Observed:** The new tests exercise real window movement through throw, Alt+Arrow, Home, and Reset. This addresses the earlier review’s main integration gap.
- **Observed, deferred to T6:** Pentimento checks reduced motion only when its next step executes. A live change can therefore wait up to 550 ms instead of completing at the next frame. Its cancellation on replay and unmount is otherwise present.
- **Derived:** “Loading units…” forever without JavaScript does **not** violate 001 R3, which protects the card. It is misleading fallback text. Prefer static “Animations require JavaScript,” then set “Loading units…” when mount starts loading.

**Could not check:** Browser behavior, actual focus-ring pixels, screen-reader announcements, runtime timer traces, lint, tests, build size, or the T7 mock comparison. I ran only read-only inspection commands, including `git status --short` and `git diff HEAD`. I changed no files and ran no network, build, test, deploy, or git-write commands.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/005-wip-windows/spec.md (all, including "Advisor decisions" and the amended R9) and tasks.md (rows T3, T4, T5; T6 adds full reduced-motion live-change tests, T7 the mock comparison)
- docs/specs/001-sheet/spec.md (R2.a/R2.c, R7, R17, R18, R19, R22, the layout table with Pentimento h 635, and "Advisor decisions")
- docs/review/spec-005-t1-t2-review-codex.md (finding 1 was moved to T3: the real onMove hook must be exercised on the page)
- Mock: docs/mockups/rargu-os-src/part1.html (Castle Wars and Pentimento window markup/CSS) and reused.js (Castle Wars sprite sheets, Pentimento sketch)
- The change under review: the uncommitted working tree against HEAD. Run `git status` and `git diff HEAD`, and read the new untracked files (src/sheet/demos/castlewars.ts, castlewars.css, pentimento.ts, pentimento.css, virtual.d.ts, tests/e2e/castlewars.spec.ts, tests/e2e/pentimento.spec.ts, tests/unit/pentimento.test.ts). Also read src/sheet/main.ts, src/sheet/demos/visibility.ts, src/sheet/view.ts, src/sheet/windows.ts, src/sheet/gestures.ts, scripts/sheet-content.ts, scripts/castlewars-frames.ts.

Task: review T3+T4 (Castle Wars: mount once, load on first eligibility or activation, loading/error/Retry with one timer chain, each frame's JSON duration, pixel-sharp drawing, Pause stays, runs only while visible and resumes from the same frame, native buttons with aria-pressed that keep focus and never drag the window) and T5 (Pentimento: scripted run, a new run cancels the previous one, unmount cancels all timers, disclaimer line and footer, live-region completion, Run button keyboard and no drag, fixed 635 px window with a five-line command panel). Check:
1. correctness against each acceptance check (R1.a, R1.b, R3.a, R4.a, R5.a, R6.a, R6.b, R8.a) and the requirement text;
2. timers and frames: leaks, duplicate chains after Retry/visibility flips/rapid presses, timers while hidden/paused/reduced-motion, animation frames while idle (001 R22), resume-from-same-frame correctness;
3. a specific risk the subagent raised: the sprite images are created during page load and so delay the window `load` event; in WebKit, view.start() waits for `load` when the stylesheet is late. Can this delay or break the start view (001 R13/R15/advisor insets) on a slow network? Should sprite loading wait until after `load` or be decoupled?
4. activation paths (pointer press, focus, card navigation) and their interaction with the one-gesture owner and with focus reveal;
5. no-JS state (001 R3: card works without JS; Castle Wars shows "Loading units…" forever without JS — acceptable or should the static markup say something else?);
6. accessibility: names, live regions, contrast pairs (R18) for new colours, focus visibility inside the windows;
7. tests that cannot fail, sleep, count frames instead of state, fake input where real input is possible, or rely on instrumentation that changes behaviour.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, no change to old-OS code or files under src/apps/, never art-source/. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
