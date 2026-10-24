# Spec 001 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166c7-364d-7c40-b402-b4fd3e9bec06 · **Tokens:** 96,269
- **Date:** 2026-10-22 · **Commit:** 690714f (spec 001 draft, uncommitted at the time)
- **Prompt:** below the dispositions.

## Dispositions

Checked by Claude against the files and by calculation (contrast ratios and the settle time were recomputed; both
match Codex's numbers: 2.25:1, 2.23:1, worst-case settle 0.854 s with the normalized torque).

| # | Sev | Disposition | What changed in the spec |
|---|---|---|---|
| 1 | High | Accepted | R3: card content visible by default; it folds only after JS starts. R3.a runs at 1440 and 390 widths. |
| 2 | High | Accepted | New R21: one active gesture at a time, second-pointer rules, cancel on `pointercancel`, lost capture and blur, without a throw. |
| 3 | High | Accepted | R19 rewritten: named, focusable windows; keyboard move and Home; minimap and arrow keys only with sheet focus; Escape and focus return for the phone card. |
| 4 | Medium | Accepted | Approach: normalized torque formula copied; kick is angular velocity; thresholds must hold after settle; long-flight case added. |
| 5 | Medium | Accepted | R8.b uses independent fixtures (v = 1000 px/s → 103.76 px; capped; diagonal; clamped; stale; zero). "Translation stops". |
| 6 | Medium | Accepted | R5: minimum zoom is computed from the viewport (no 15 % floor); fit uses the full view; resize and rotation tested. |
| 7 | Medium | Accepted | R10: edge speed in px/s, frame-rate independent; release velocity excludes sheet auto-scroll. |
| 8 | Medium | Accepted | R5: Safari `gesture*` events, `deltaMode` normalization, one handler per gesture; Firefox and WebKit e2e; physical Safari trackpad check is owner-reported or **Unverified**. |
| 9 | Medium | Accepted | R17: landing math unchanged; destinations commit at once for throw, Home, Reset, navigation, zoom and glide. |
| 10 | Medium | Accepted | R13: Reset cancels gestures and animations and targets home positions explicitly. |
| 11 | Medium | Accepted | R2.b: a build plugin checks every module bundled for the `next` entry and fails on a forbidden path; a fixture proves it fails. |
| 12 | Medium | Accepted | R11: build-time escaped HTML transform for the card; explicit field map; fixture test. |
| 13 | Medium | Accepted | R14: ordered five-project allowlist; validate selected files only; field types; no block scalars. |
| 14 | Medium | Accepted | R1: local `wrangler dev` checks for `/next`, `/next.html`, `/next/`, `/resume`, unknown path 404. No deploy. |
| 15 | Medium | Accepted | R7: window and demo-area sizes from the mock (measured); placeholders are inert; R20 lists deferred differences by spec. |
| 16 | Medium | Accepted (owner ruling) | Owner 2026-10-22: fix the weak pairs; mock v0.6. R18 adds contrast thresholds. |
| 17 | Low | Accepted | New R22: ≤ 100 KiB gzip JS + CSS for `/next` (fonts excluded); no animation callback while idle; no demo assets. |

## Codex output (verbatim)

Revise the spec before approval. The main gaps concern input handling, accessibility, and checks that can accept incorrect behavior.

**Evidence:** File observations below come from read-only `nl -ba` and `rg` commands. Numerical results come from `python3 -c` calculations. Predicted failures are labeled **derived**. No files changed. No network actions ran.

1. **High — The phone layout defeats the no-JavaScript requirement.** [spec.md:61](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:61)

   **Observed:** R3.a requires visible identity details and working links without JavaScript. R15 folds the card. The mock hides `.more` when the card is closed, and JavaScript operates the toggle (`part1.html:177`, `part2.js:12`).

   **Derived:** Porting this behavior hides the name, role, email, and links permanently on phones without JavaScript.

   **Fix:** Add: “The identity content is visible by default. Collapse it only after JavaScript starts successfully.” Run R3.a at desktop and 390 × 844 sizes.

2. **High — Touch gestures have no ownership or cancellation rules.** [spec.md:35](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:35)

   **Observed:** R4, R5, and R8 require one-finger pan, two-finger pinch, and window drag. The mock excludes title bars and several controls from its pinch pointer collection (`part2.js:114–127`). Its window handler does not track an active pointer ID (`part2.js:92–105`).

   **Derived:** A second finger on a held title bar can replace the first grab. A pinch that starts on a window control might never become a pinch.

   **Fix:** Specify one active gesture: paper pan, window drag, pinch, minimap drag, or content interaction. Define second-pointer transitions and content exclusions. Require `pointercancel`, lost capture, and page blur to clear the gesture without a throw. Define this shell contract now. Leave app integration to 002–006.

3. **High — Tab reachability does not provide usable keyboard access.** [spec.md:50](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:50)

   **Observed:** R19 requires windows and zoom controls to be reachable. R19.a checks only card controls. Home requires double-click. The minimap has no keyboard behavior. The mock windows are unnamed, nonfocusable `<div>` elements (`part1.html:235`).

   **Derived:** A keyboard visitor can lose focus behind the card or another window. The spec also permits window movement and Home to remain pointer-only.

   **Fix:** Require named window regions, an explicit focus order, visible focus outside overlays, and focus-triggered reveal. Provide keyboard and single-pointer alternatives for Move and Home. Restrict sheet arrow shortcuts to sheet focus. Require navigation to focus the destination without a second browser scroll. Define Escape and focus return for the phone card.

4. **Medium — The physics definition omits the normalization that makes the settle bound work.** [spec.md:111](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:111)

   **Observed:** The text says torque is `r × v`. The mock instead uses:

   `torque = (rx·vy − ry·vx) / (hypot(rx, ry) + 1)`

   It computes the kick from the actual landing displacement and pin velocity (`part2.js:59`, `86–90`).

   **Derived:** With the mock normalization and a capped 360 px flight, pin speed is at most **469.553 sheet px/s**. The kick is at most **92.683°/s**. From zero initial rotation and angular velocity, the one-second envelopes are **0.02335°** and **0.38147°/s**. Those numbers meet the stated thresholds.

   Literal, unnormalized torque at a 310 px lever produces a roughly **449.49°/s** kick. Its angle is **0.0383° at 1.0 s**, but **−0.0604° at 1.1 s**. R8.c can pass before the motion exceeds the threshold again.

   **Fix:** Copy the normalized torque formula into the spec. Define kick units as angular velocity. Include held-angle limits, inherited angular velocity, and long-flight cases. Keep the approved constants. Require both thresholds to remain satisfied after settling.

5. **Medium — R8.b uses the implementation as its own oracle.** [spec.md:74](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:74)

   **Observed:** The expected landing point comes from `physics.ts`, which also implements the behavior.

   **Derived:** An incorrect landing formula can agree with itself. “It does not move after that” also conflicts with the required rotational wobble.

   **Fix:** Replace the expected result with independent fixtures. For example, an unclamped `v = (1000, 0)` throw travels **103.759766 sheet px** by 0.24 s. Add capped, diagonal, clamped, stale-sample, and zero-velocity fixtures. Say “translation stops,” while rotation follows its separate settle rule.

6. **Medium — Porting the mock’s zoom minimum breaks phone Fit.** [spec.md:68](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:68)

   **Observed:** R5.b requires the whole sheet to fit. The mock imposes a 15% minimum (`part2.js:21`). At 390 px, that makes the sheet 450 px wide.

   **Derived:** Fit cannot satisfy R5.b. The mock’s 32 px allowance requires approximately **11.93%**, not 15%.

   **Fix:** Explicitly replace the 15% floor. Define whether Fit uses the full viewport or the area clear of overlays. Specify clamping behavior when pointer anchoring becomes impossible at scroll boundaries. Test Fit, zoom-out, resize, and orientation changes.

7. **Medium — Drag coordinates and edge scrolling lack a complete contract.** [spec.md:80](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:80)

   **Observed:** R8.a tests dragging at two fixed zoom levels. R10.a only requires scroll growth. The mock scrolls `penetration × .35` per frame and records sheet-coordinate samples during edge scrolling (`part2.js:66–70`).

   **Derived:** Edge speed doubles between 60 Hz and 120 Hz. A stationary hand also produces release velocity while the sheet scrolls, which leaves R8.d’s “no movement” ambiguous.

   **Fix:** Define screen and sheet units throughout. Express edge speed per second. State whether release velocity includes sheet motion. Test a stationary pointer during edge scrolling and zoom changes. Require grab-point accuracy after each update, including at sheet boundaries.

8. **Medium — Browser pinch support is promised but not verified.** [spec.md:36](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:36)

   **Observed:** The mock handles modifier-wheel and touch pointers. It has no Safari gesture-event path (`part2.js:34`, `113–133`). The required checks cover Chromium desktop and phone emulation (`spec.md:123`). WebKit and Firefox projects already exist (`playwright.config.ts:42–55`).

   **Derived:** The spec can pass without establishing Safari trackpad behavior or preventing duplicate zoom handling.

   **Fix:** Define wheel `deltaMode` normalization, modifier-wheel behavior, supported Safari gesture handling, and event deduplication. Preserve browser page zoom controls. Require Firefox and WebKit checks plus an explicit physical Safari/trackpad check. Label unavailable hardware coverage **Unverified**.

9. **Medium — Reduced motion conflicts with the code being ported.** [spec.md:95](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:95)

   **Observed:** R17.a requires an instant landing. The mock removes release velocity under reduced motion, but its `fly()` still animates Home and Reset (`part2.js:86–104`, `151`).

   **Derived:** A faithful port can discard throw distance and still animate other moves.

   **Fix:** State that landing computation remains unchanged. Under reduced motion, commit the destination immediately and clear rotation, lift, and animation callbacks. Test throw, Home, Reset, navigation, zoom, and paper glide. Define what happens when the preference changes during motion.

10. **Medium — Reset can navigate to the old CastleSiege position.** [spec.md:87](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:87)

    **Observed:** The mock starts flights home, then immediately calls `panTo("castlesiege")`. That function reads the current position (`part2.js:139–151`).

    **Derived:** After CastleSiege was thrown elsewhere, Reset can frame its previous position while it flies home.

    **Fix:** Require Reset to cancel active gestures and animations, target the home position explicitly, and restore the applicable desktop or phone zoom. Define repeated Reset, Reset during drag, and grabbing a flying window. Test Reset after moving CastleSiege outside the current view.

11. **Medium — The Vite manifest cannot establish R2.b.** [spec.md:59](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:59)

    **Observed:** The installed manifest format lists chunks and chunk imports. It does not list every bundled source module (`node_modules/vite/dist/node/index.d.ts:4214`). Manifest generation is also disabled by default.

    **Derived:** Kernel code bundled into a generically named sheet chunk can escape this check. The `app-*.js` request check does not close that gap.

    **Fix:** Inspect reachable output chunks and their source-module records during the build. Cover static imports, dynamic imports, and preload references. Prove the guard fails when a used forbidden import is deliberately introduced.

12. **Medium — Static identity generation is unspecified.** [spec.md:103](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:103)

    **Observed:** R11 requires identity values from JSON. The approach names static card HTML and a project-data virtual module. The existing identity transform only handles `index.html` metadata (`vite.config.ts:35`). JSON has no Resume URL or project-list fields (`content/identity.json:1–14`).

    **Derived:** Hardcoded card text can drift from JSON. The virtual module alone cannot update HTML for visitors without JavaScript.

    **Fix:** Specify an escaped build-time HTML transform for the card, title, and description. Map each field explicitly. Set Resume to `/resume`, project items to project data, and tool labels to layout data. Add a fixture that changes identity JSON and checks raw HTML. Keep full link-preview migration in 007.

13. **Medium — The project glob and parser contract are too broad.** [spec.md:106](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:106)

    **Observed:** The glob includes Whole-Plant Ice Cream, which must remain excluded. R14.b requires failure for a project without `summary`. Existing files lack that field. The parser returns `[]` for an empty value and does not support YAML block scalars (`src/apps/resume/doc.ts:26–38`).

    **Derived:** Whole-Plant Ice Cream can fail the build despite being intentionally excluded. `summary: |` can render as a literal pipe.

    **Fix:** Define the ordered five-project allowlist. Validate only selected records. Specify required scalar and list types, supported status values, and summary syntax. Reject empty or malformed values with the filename. Keep parser imports build-only and export plain data to the client. Define source-file watching for the virtual module.

    Build-time parser reuse already has precedent in `scripts/build-resume-html.ts:5`. DOM access at import time is not an observed blocker.

14. **Medium — Vite preview does not verify Cloudflare URL handling.** [spec.md:55](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:55)

    **Observed:** Playwright uses Vite preview (`playwright.config.ts:16`). Cloudflare uses `auto-trailing-slash` and real 404 handling (`wrangler.jsonc:15–17`). The installed Cloudflare asset code supports `/next` from `next.html` and normalizes its aliases.

    **Derived:** The proposed entry approach is viable, but Vite-only tests do not establish production redirect and relative-asset behavior.

    **Fix:** Require local Cloudflare asset checks: `/next` returns the sheet, `/next.html` and `/next/` normalize correctly, assets load after redirects, `/resume` still works, and unknown paths return 404. Preserve both existing Vite inputs. These checks require no deploy.

15. **Medium — Placeholder geometry and visual acceptance leave scope open.** [spec.md:45](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:45)

    **Observed:** R14 requires empty demo areas. The approved mock’s contents determine window heights. The layout table only explicitly supplies home positions. R20 accepts “reasoned differences” without limiting their reasons.

    **Derived:** Empty bodies can shrink windows and alter the minimap, clamping, and layout. Conversely, R20 can pull demo implementation from 002–006 into 001.

    **Fix:** Define dimensions for all eight shell windows and reserved demo areas. Require inert placeholders without demo controls or app imports. List deferred differences by later spec number. Require remaining differences to match an explicit approved exception. Name comparison viewports, themes, and interaction states.

16. **Medium — Exact mock colors conflict with readable text and focus indicators.** [spec.md:49](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:49)

    **Observed:** The mock uses cream text on pink dark-theme title bars (`part1.html:32`, `107`). Calculated contrast is **2.25:1**. Blue status text on cream is **2.23:1**. Small text needs a stronger contrast target.

    **Derived:** Matching the palettes alone permits unreadable labels. The same blue also gives weak focus contrast against cream.

    **Fix:** Add explicit text and focus contrast acceptance thresholds. Record the affected mock colors as a conflict requiring an approved exception. Preserve the owner’s palette decision through approved foreground/background pairings. Do not silently replace the visual baseline.

17. **Low — Performance has no acceptance budget.** [spec.md:9](/Users/rargu/DevPageOS/docs/specs/001-sheet/spec.md:9)

    **Observed:** Slow startup motivates the redesign, but no requirement limits startup work. The mock runs a permanent minimap animation loop and applies `will-change` to every window (`part2.js:163`, `part1.html:105`).

    **Derived:** The page can pass while retaining unnecessary idle work or eagerly loading later demos.

    **Fix:** Add measurable ceilings before approval. A proposed starting point is 100 KiB compressed entry JavaScript plus CSS, excluding fonts. Require no demo assets in 001, no recurring sheet animation callback while idle, and recorded frame timings on a named device profile.

**What I could not check:** No browser or hardware gestures ran. No build, lint, or tests ran because the pipeline writes generated files. The one-second calculation covers the normalized kick from rest, not every inherited oscillator state. Instrument Sans files and its packaged OFL license were unavailable for provenance checks. The spec should require that license in the output without replacing the existing Pixel Operator CC0 notice. Full link previews and live hosting remain checks for 007.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (the RArgu OS site). Do not modify files.

Read first: AGENTS.md; docs/specs/001-sheet/spec.md (the spec under review); docs/OWNER_QUESTIONS.md (owner decisions, binding); docs/mockups/README.md and the mock sources in docs/mockups/rargu-os-src/ (part1.html, part2.js, part3.js; the approved behaviour); vite.config.ts; playwright.config.ts; index.html; src/apps/resume/doc.ts; content/identity.json; content/projects/*.md; src/ui/tokens.css; public/_headers; public/_redirects; wrangler.jsonc.

Task: critique spec 001 before the owner approves it. Look for: requirements that are ambiguous, untestable, or whose acceptance check cannot fail; missing requirements (accessibility, performance, touch vs mouse conflicts, zoom + drag coordinate math, browser differences such as Safari gesture events and ctrl+wheel pinch, focus handling, link previews); conflicts with the owner decisions or the mock; risks in the approach (Vite multi-page input, virtual module, reusing parseFrontmatter at build time, serving /next on Cloudflare static assets with html_handling auto-trailing-slash, font licensing); wrong numbers in the physics (check that R8.c's 1.0 s settle bound holds for the given ζ, ω and maximum kick); and scope that belongs in specs 002–007 instead.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
