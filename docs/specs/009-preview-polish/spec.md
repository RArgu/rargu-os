# 009: Preview polish (smooth drag, hint, 404, phone mark)

**Status:** Verified (local) · **Owner approval:** scope by owner request 2026-10-24 (see Approval record) · **Gates needed:**
none
**Related:** 007 T11 preview (approval record of `docs/specs/007-switch-over/spec.md`); 001 R7–R10, R12, R17, R22 and
Approach "Physics"; OWNER_QUESTIONS "Wobble" (2026-10-22); mock v0.7 (`docs/mockups/rargu-os-v0.7.html`); Fable
advisor report 2026-10-24 (evidence in the session scratchpad `fable-009/`, summarised in the ledger).

## Why

The owner previewed the switch-over build (007 T11) and asked for four fixes before deploy: window drags look janky
"like motion blur", the CastleSiege music hint names a speaker icon the sheet does not have, the 404 page still has
the old OS look, and on a phone opening the card moves the list's mark away from CastleSiege. The owner asked the
Fable advisor to decide how; this spec writes those decisions down so they can be built and tested.

## Assumptions

1. The jank is rendering, not frame pacing: `.sheet-win` has no `will-change` (`src/sheet/sheet.css:180-195`, the
   mock has it, `docs/mockups/rargu-os-src/part1.html:107`), so a scripted drag repaints the window and the viewport
   on every frame (357 devtools Paint events vs 60 with the one line; Chromium headless, Fable `measure.mjs`); and the
   held lean (up to 8.6° at 600 px/s, up to 1.5° per frame) plus the 1.03 lift scale resample every edge each frame.
   [Code + measured] Real-pointer lag is **Unverified**.
2. `os.ui.notify` on the sheet is `console.info` only (`src/sheet/host/load.ts:309`), so `musicHint`
   (`src/apps/lib/open.ts`) has never been visible on the sheet. [Code]
3. `public/404.html` is a separate static page served by Cloudflare for unknown paths; it cannot load the sheet's
   hashed modules. [Code]
4. On a 390 × 844 phone with the card open, the "area below the open card" is 20 px high (card ends y 669, minimap
   at y 721), so the mark follows a strip nobody can see (`src/sheet/view.ts:482-506`). [Measured, Fable `phone.mjs`]

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | A window that is held, flying, wobbling or flying Home carries `will-change: transform` (a layer hint; browsers may decline it); the hint is removed when the window is at rest. At rest no window has the hint, so text at any zoom is rastered as today. | [Prop] | e2e | — |
| R2 | While held, a window only translates: the grab point follows the pointer exactly; no tilt and no scale. The lifted shadow stays as the "picked up" cue. | [Prop] | unit + e2e | — |
| R3 | The pin wobble is smaller and better damped: kick = sign(t)·2.5°·ln(1 + \|t\|/150)·ω, free damping ζ = 0.45, ω = 2π·2.6 (was 4° and 0.34). Throw peak \|θ\| ≤ 2.5°; Home peak \|θ\| ≤ 3.0° (worst case 2.67°, was 4.33°+). Throw, flight, cap, clamp and Home math unchanged. Reduced motion unchanged (001 R17). Times are measured from the pin. | [Prop] | unit + e2e | — |
| R4 | A scripted drag at zoom 100 % (Chromium, one worker) costs at most 150 devtools Paint events (HEAD: 357). Frame times are recorded in the ledger, not gated. | [Prop] | e2e (Chromium) | — |
| R5 | No visitor-facing text names a control the sheet does not have: `musicHint` and its calls are removed; no replacement message. | [Prop] | unit + e2e | — |
| R6 | The 404 page is a corner of the blueprint sheet: "4", "0", "4" as three small windows that can be dragged, thrown and moved by keyboard with the sheet's feel (R2, R3); copy, links `/` ("Open RArgu OS") and `/resume` ("Read the resume") that work without JS; light and dark from the sheet's tokens; fonts from `/fonts/`; title "404 · RArgu OS", `noindex`; inline CSS and JS ≤ 8 KiB gzip; no third-party requests, no storage; reduced motion: moves commit at once, no rotation. | [Prop] | unit + e2e + local wrangler | — |
| R7 | The card's list mark uses the navigation area (beside the card on desktop, below the folded bar on phones), the same centre list navigation uses. Opening or closing the card does not change the mark. Amends 001 R12/R12.b. | [Prop] | e2e | — |
| R8 | No other behaviour changes; all existing suites pass with the amended expectations; budget unchanged in kind (shell ≤ 100 KiB, total ≤ 150 KiB). | [Prop] | unit + e2e | — |

### Acceptance

- **R1.a** Given a window held, then its computed `will-change` is `transform`; given it thrown, then the hint stays
  through the flight and the wobble and is gone within one frame after it rests; at the start view and after a zoom
  to 50 % and 160 %, no window has the hint. The idle check of 001 R22.a still passes.
- **R1.b** Visual: settled screenshots at phone fit, 50 %, 100 % and 160 % (zoomed in and out) in Chromium and
  WebKit, including text inside a hosted app, equal the HEAD `f54ed3c` screenshots at the same scale (no new blur).
- **R2.a** Given a window held and moved in 20 steps at about 600 px/s (001 R8.a), then after each step the grab point
  is within 1 px of the pointer and the window's transform, parsed for translate, rotate and scale independently, has
  rotation 0 and no scale other than 1. The held-lean test (`tests/e2e/sheet-windows.spec.ts:689`, rotation > 0.5°)
  is replaced by this check; the transform parser (`:143`) and the literal at `compact-sheet.spec.ts:349` are updated
  so they still detect a rotation or a scale.
- **R2.b** Unit (`physics.ts`): there is no held sway mode; the held state sets θ = θ′ = 0.
- **R3.a** Unit fixtures at dt = 1/120, each defined by window, start, destination and grab point: the capped throw
  (360 px, bar grab) peak |θ| ≤ 2.5°; Home of CastleSiege from (2380, 986) to (360, 100) with a title-bar grab at
  (310, 12) (torque ≈ 1051, the largest valid Home) peak |θ| ≤ 3.0°; in both, from 0.8 s after the pin |θ| < 0.05°
  and |θ′| < 0.5 °/s. 001 R8.c becomes "from 0.8 s after the pin onward".
- **R3.b** E2E (Chromium, Firefox, WebKit): after a 2000 px/s flick, the sampled max |θ| ≤ 2.5° and |θ| < 0.05° from
  0.8 s after the pin.
- **R4.a** A Chromium-only test with one worker, 1280 × 800 at DPR 2, trace category `devtools.timeline`, no
  screenshots in the measured phase: a scripted drag (400 px right and 240 px down at ~600 px/s, 300 ms still, a
  5-step flick, 1.6 s settle). It asserts the drag happened (the window moved by the expected amount) and Paint
  events ≤ 150. Fails on HEAD `f54ed3c` (357). Run 5 times before the threshold is final; record the spread.
- **R5.a** `grep -rn "speaker" src/` finds nothing; `musicHint` is not exported; 003 R7.a and 004 R6.a pass.
- **R6.a** Unit: the gzip size of `public/404.html` ≤ 8 KiB; no `localStorage`/`sessionStorage`/`indexedDB`/
  `document.cookie`; `noindex`; the light and dark token values equal the sheet's. Secondary check: the physics
  constants in it (named constants, extracted by a defined regex) equal `src/sheet/physics.ts`.
- **R6.b** Behaviour fixtures (the primary drift guard), through the page's real pointer and keyboard handlers with a
  controlled clock: flight midpoint and capped landing (an unclamped 5000 px/s release lands at release + 360 px,
  as the sheet), pin kick and settle (from the pin, < 0.8 s), Home, and the same landing with reduced motion (which
  commits at once with no frames after). Pointer and keyboard throws use the same capped landing.
- **R6.c** Interruptions as the sheet: one gesture owner (a second pointer on another digit is ignored); Home during a
  hold ends the hold with no throw; window blur and `pointercancel` end a hold with no throw; a live switch to reduced
  motion ends flights and wobbles at their targets and leaves no pending animation frame; a resize re-clamps resting
  digits and active landings into the new viewport.
- **R6.d** Access: each digit has a distinct name ("Digit 4, first", "Digit 0", "Digit 4, last") and a short key hint;
  roles and Tab stops are added only after the script starts (with JS off the digits are plain text); pointer press
  focuses the digit; a focused or held digit is brought to the front; the focus ring has ≥ 3:1 contrast against its
  neighbours (a paper band as `sheet.css:255`); Enter/Space throws as stated in the hint.
- **R6.e** Layout: the page scrolls when content is taller than the viewport (no `overflow: hidden` on the body);
  the links stay reachable and clickable at 390 × 844, 844 × 390, 1440 × 900 and at 200 % text, with and without
  JS, also when a digit has been thrown over them (links stay above the digits).
- **R6.f** E2E on local `wrangler dev` (routing config, plus WebKit and a mobile touch project): `/nope` answers 404
  with title "404 · RArgu OS"; only same-origin requests; with JS off the digits and links show and the links go to
  `/` and `/resume`; a touch drag moves a digit with translate only.
- **R7.a** Given a 390 × 844 phone at the start view, when the card opens and closes, then CastleSiege stays the
  marked item and the scroll position is unchanged. The same after navigating to the crawler and after a manual
  pan. The test helper `nearest()` uses the folded bar's geometry. **R7.b** Given the view centred on Pentimento
  (desktop), then Pentimento is marked (001 R12.b kept).
- **R8.a** `npm run lint`, `npm test`, `CI=1 npm run e2e:all`, `CI=1 npm run e2e:routing` pass; budget report OK.

## Approach

- `src/sheet/windows.ts` (+ `sheet.css`): set `will-change: transform` when a window's gesture or motion starts and clear it when it rests (R1). Lead decision after the critique (finding 3–4): Fable measured the always-on hint; the per-motion hint keeps the drag gain without eight permanent layers or a stale raster scale after zoom. If R4 fails with it, the always-on hint is the fallback, with R1.b as the guard.
- `src/sheet/physics.ts`, `src/sheet/windows.ts`: remove `swayTarget`, `ZETA_HELD`, `LIFT` and the held swing; held
  sets θ = θ′ = 0; `KICK` 4 → 2.5, free ζ 0.34 → 0.45 (R2, R3). Update the unit fixtures and 001 R8.c.
- `tests/e2e/sheet-perf.spec.ts` (or a new perf test): the R4 drag trace.
- `src/apps/lib/open.ts`, `src/apps/castlesiege/main.ts`, `src/apps/tracker/main.ts`: delete `musicHint` and its
  calls (R5).
- `public/404.html`: Fable's draft (scratchpad `fable-009/404.html`, 4.5 KB gzip) as the start; its ~2 KB physics is
  a copy, guarded by the R6.a constants test. `tests/e2e/routing.spec.ts` and `scripts/routes.ts` keep their `/nope`
  checks (R6).
- `src/sheet/view.ts`: `mark()` uses `area()` (navigation area) instead of `area(true)`; replace the compact test that
  asserts the mark changes (`tests/e2e/compact-sheet.spec.ts:635-649`) (R7).
- Docs: 001 spec "Physics" (held sentence, kick, ζ), R8.c, R12/R12.b wording, and an R20 note that held and post-pin motion differ from the mock by 009 (owner request); OWNER_QUESTIONS "Wobble" row.
- **Rejected:** keeping a smaller held lean (still resamples every frame); rounding translate to device pixels (no
  measured gain); a visible music note (the sheet has no visible notify channel; Fable's text kept in the ledger for
  later); importing the sheet's modules into the 404 page (hashed and large).

## Boundaries

- **Always:** tests first and seen failing; respect reduced motion; keep the site static; amend 001 where its text
  changes.
- **Ask first:** a new dependency; any change to throw/flight/Home math beyond R3; new network calls.
- **Never:** deploy or push; touch `art-source/` or `.claude/`.

## Out of scope

- Fable's optional items: idle paints at zoom ≠ 100 % with demos on screen (re-measure after R1), the 50 ms pickup
  frame (the lifted-shadow transition). Listed for the owner.
- The phone fit of wide windows (owner deferred 2026-10-24).

## Open questions

- None. Fable's decisions are listed for the owner's confirmation in the morning report.

## Critique

`docs/review/spec-009-critique-codex.md`: 2 High, 8 Medium, 1 Low. All accepted; finding 3 (layer memory) is met
with the per-motion hint (R1) rather than device memory measurements, and finding 5 by gating only on Paint count
with one worker.

## Approval record

2026-10-24 — Owner request after the 007 T11 preview: "the window drags look kind of janky … make the wobble less
aggressive (ask Fable how)", "Change the hint to not use what's no longer there", "Change it [404] to something
different, have Fable come up with something", "Needs a fix? Fix if so", "Drive this overnight, bring decisions to
me". Recorded as approval of this scope; the designs are Fable advisor decisions for the owner to confirm.

2026-10-24 — Owner answers to the morning report: 1 (held window, no tilt) "We want the tilt back": R2 is replaced
by spec 010 R1 (the pre-009 lean, no lift scale). 2 (landing wobble) "We'll revisit later, mocking in Blender
first": kept as built. 3 (music hint), 4 (404), 5 (phone mark) "Good", with the 404 tip line removed by spec 010
R2. 6 (scope approval) "Correct". 7 (layer hint only while moving) "Good".
