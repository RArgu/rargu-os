# 005: Work-in-progress windows (Castle Wars, Pentimento)

**Status:** Archived 2026-10-24 (spec 007 T7; living docs updated); was Verified (local) 2026-10-23 (T1–T8, branch `spec-005-wip`); Approved · **Owner approval:** 2026-10-22 · **Gates needed:** none
**Related:** spec 001 (windows, layout table, reduced motion; Amendment 1, R2.c: sprite assets allowed); mock v0.6
(`docs/mockups/rargu-os-src/reused.js`); OWNER_QUESTIONS 2026-10-22 (Castle Wars shown as WIP with the real sprites);
`content/projects/pentimento.md`; critique `docs/review/spec-005-critique-codex.md` (11 findings, all accepted).

## Why

Two projects are not playable yet. The sheet still shows them working in a small, honest way: Castle Wars as its
real hand-animated units, and Pentimento as a short sketch of the workflow it is built for. Neither uses the app
host (002).

## Assumptions

1. The six unit sheets in `src/apps/castlewars/art/` (`archer`, `hammerman`, `knight`, `spearman`, `swordsman`,
   `wizard`; PNG strips with Aseprite JSON) are the source. Each has the tags idle, walk, attack, hit, death,
   victory, remains, and per-frame durations (for example `wizard.json`: attack 200/100/200 ms). [Code]
   `art-source/` is not used (not in git).
2. Pentimento is in planning; nothing is built (`content/projects/pentimento.md`). The sketch shows the intended
   workflow and must say so.
3. The mock starts a new Pentimento timer chain on every press without cancelling the last one (`reused.js:64`); a
   direct port can show three layers (Codex 005 #3, observed by simulation). [Code]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | Castle Wars: the six units drawn pixel-sharp, with buttons idle, walk, attack, victory, death and a Pause/Resume button. The chosen animation loops for all six with each frame's own duration from the JSON. The footer names the animation. Text below the canvas names the six units. | [Prop] | e2e | — |
| R2 | Frame data (size, tag ranges, durations) is generated at build time from the JSON files by one generator. | [Prop] | unit | — |
| R3 | Loading: the sprite PNGs load when the window first becomes eligible (its current rectangle, at the current zoom, overlaps the view expanded as in 002 R11), or on activation. A window eligible at start may load at once. One mount per window, even after repeated activation. | [Prop] | e2e | — |
| R4 | Animation runs only while the window's current rectangle overlaps the view and the tab is visible; it resumes from the same frame. A visitor's Pause stays paused across these. | [Prop] | e2e | — |
| R5 | Loading state: "Loading units…" until all six images load. If one fails, the window shows an error and Retry; Retry loads once with no duplicate timers; other windows keep working. Buttons pressed before load set the animation that starts on load. | [Prop] | e2e | — |
| R6 | Pentimento: sample image with text, layers list, command panel. "Run the agent" plays the scripted steps (detect text → extract to a layer → fill behind it → "done: 2 layers") and adds the text layer. A new run cancels the previous run first. Unmount cancels all timers. The footer and an on-screen line say "Sketch of the planned agent CLI · nothing built yet". A short completion message is announced to screen readers. | [Prop] | e2e | — |
| R7 | Reduced motion, at start and on a live change in either direction: Castle Wars shows the first frame of the chosen tag and changes only on a button press; a running Pentimento sketch jumps to its final state; no CSS animation on new layers. | [Prop] | e2e | — |
| R8 | Controls are native buttons with keyboard use and `aria-pressed` for the chosen animation; using them keeps focus and never drags the window. | [Prop] | e2e | — |
| R9 | Both windows match mock v0.6 in these views: each window centred at 1440 × 900 and 390 × 844, light and dark; Castle Wars on each animation (paused); Pentimento before and after a run. Allowed differences only: JSON frame durations (owner-visible timing), the Pause button, the unit-name text, the disclaimer line, and Pentimento's fixed window height of 635 px (the mock's post-run height) before a run, so the command panel holds all five lines without growing the window (advisor decision 2026-10-23, T5; 001 layout table updated). Anything else is a defect. | [Prop] | compare-vs-mock | — |
| R10 | Spec 007 keeps the six PNGs and JSON files. | [Prop] | review | — |

### Acceptance

- **R1.a** Given each of the five animations, then over two loops every unit shows every frame of that tag in order
  and wraps to the first; frame times match the JSON within 20 ms (fake timers).
- **R1.b** Given zoom 160 %, then the canvas has `imageSmoothingEnabled` false and `image-rendering: pixelated`.
- **R2.a** A unit test runs the generator on a fixture JSON with changed sizes and durations and gets those values;
  on the real `wizard.json` it gets frame 80 × 50 and walk = frames 2–9.
- **R3.a** Given a test layout with Castle Wars far outside the expanded view, then no sprite request happens until
  the view moves near it; then the six load once. Activating the window twice mounts it once.
- **R4.a** Given the window animating, when it leaves the view for 2 s and comes back, then frame counters advanced
  before, did not change while away, and advance after. The same holds for a hidden tab
  (`visibilitychange`). Given Pause pressed, then after returning it is still paused.
- **R5.a** Given one PNG request failing (route fulfil 500), then the error and Retry show; given Retry with the
  request now working, then the units animate and only one timer chain runs.
- **R6.a** Given "Run the agent" pressed, then the command panel shows the four lines in order and the layers list
  ends as "Text: SUMMER SALE" above "Background". Given a second press during the extract step, then the final state
  still has exactly two layers and one copy of each line. Given unmount mid-run, then no later change happens.
- **R6.b** Given before, during and after a run, then the "nothing built yet" line is visible.
- **R7.a** Given reduced motion at load, then two screenshots 1 s apart are identical; given the preference turned
  off, then frames advance; given it turned on during a Pentimento run, then the final state shows at the next
  frame.
- **R8.a** Given focus on "attack", when Enter is pressed, then attack plays, the button has `aria-pressed="true"`,
  focus stays on it, and the window does not move.
- **R9.a** compare-vs-mock pass for the R9 views lists only the allowed differences.

## Approach

- `src/sheet/demos/castlewars.ts` and `pentimento.ts`, ported from the mock's `reused.js` with the fixes above. Each
  exports `mount(el)` / `unmount()`; both use one visibility helper (current rectangle + `visibilitychange`).
- Build: a Vite plugin step turns the six JSON files into `{ w, h, tags, durations }`; PNGs are imported as asset
  URLs (allowed by 001 R2.c).
- **Rejected:** a playable Castle Wars slice (owner: WIP for now); a video of the sprites (heavier, not crisp);
  the mock's fixed intervals (the JSON durations are the real animation).

## Boundaries

- **Always:** label Pentimento as a sketch; keep the sheet's first-load budget (001 R22).
- **Never:** use files from `art-source/`; claim Pentimento features outside the sketch label.

## Out of scope

- The Castle Wars game; any real Pentimento code; asset deletion (007).

## Open questions

- None.

## Approval record

2026-10-22 — Owner approved this spec as written ("Approve all", together with 001 Amendment 1 and specs 002–007),
including the proposals named in it. No gate is approved by this.

## Advisor decisions (overnight run)

2026-10-23 — Decided by the Fable advisor for the owner (T5). Problem: the mock grows Pentimento from 542 to 635 px
after a run; 001 keys physics, minimap and visibility to a fixed size per window, so the built 542 px window showed
only about 1.5 of the five command lines. Decision (option C): fixed h 635 (demo h 404), command panel sized for
five lines; 001 layout table updated; R9 allowed differences extended (amendment above). Pentimento's home bottom
(715) stays above Paint (720) and Insider (800). Rejected: live window growth (touches three 001 subsystems), a
scrolling 1.5-line panel (hides the output), a tighter inner layout (differs from the approved mock). Owner to
confirm; a mock bump to v0.7 is the owner's call.
