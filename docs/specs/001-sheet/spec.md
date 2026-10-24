# 001: The sheet (RArgu OS shell)

**Status:** Archived 2026-10-24 (spec 007 T7; living docs updated); was Verified (local) 2026-10-23 (T1–T9 done); Approved (Amendment 1 approved 2026-10-22; Amendment 2 approved 2026-10-22) · **Owner approval:** 2026-10-22 · **Gates needed:** none (G-deploy is spec 007)
**Related:** mock `docs/mockups/rargu-os-v0.6.html` (sha256 `059b7b87…7177ed`); `docs/OWNER_QUESTIONS.md` rows of
2026-10-22; critique `docs/review/spec-001-critique-codex.md` (17 findings, all accepted); specs 002–007.

## Why

rargu.dev today is DevPageOS. A visitor waits for a kernel boot and a filesystem mount before anything answers, and a
recruiter must learn an OS to find the work. RArgu OS replaces it with one blueprint sheet: the owner's details are
visible at once, and each project is a live window on the sheet. This spec builds the sheet itself: the page, panning,
zoom, minimap, the overlay card, the window frames and their throw physics, and the project text. The live demos come
in specs 002–006. The old OS stays at `/` until spec 007.

## Terms

- **Screen px:** CSS pixels of the browser view. **Sheet px:** pixels of the unzoomed sheet (3000 × 1640). At zoom
  Z, 1 sheet px = Z screen px.
- **Gesture:** one of: paper pan, window drag, pinch, minimap drag, or input to a control inside a window.

## Assumptions

1. The sheet is plain TypeScript and CSS in the existing Vite build, with no UI framework, like the old OS code.
2. The page can use the colours of `src/ui/tokens.css` and the Pixel Operator fonts in `public/fonts/` without the
   window server. T1 checks that importing `tokens.css` pulls in nothing else.
3. `parseFrontmatter` (`src/apps/resume/doc.ts:10`) runs at build time; `scripts/build-resume-html.ts:5` already does
   this. [Code]
4. Whole-Plant Ice Cream is not on the sheet (owner, 2026-10-22). It stays in the resume.
5. The physics constants in Approach are the approved feel (owner, 2026-10-22, from mock v0.5).

## Requirements

| ID | Requirement | Label | Verify at | Gate |
|---|---|---|---|---|
| R1 | A second entry page, `next.html`, is served at `/next`. `/` (old OS) and `/resume` do not change, except that the old OS Projects folder also lists the new `castlewars.md` (owner, 2026-10-22). | [Prop] | e2e + local wrangler | — |
| R2 | `/next` loads no old-OS code and no third-party resource. A build check enforces this. | [Prop] | e2e + build | — |
| R3 | The overlay card's text and links are in the HTML. They are visible and work without JavaScript at every width. The card folds (phone) only after JavaScript starts. | [Prop] | e2e | — |
| R4 | The sheet is 3000 × 1640 sheet px with the mock's grid. It pans by mouse drag on the paper (with a short glide), wheel or trackpad scroll, one-finger touch, and arrow keys when the sheet has focus. | [Prop] | e2e | — |
| R5 | Zoom by ⌘/Ctrl + wheel and trackpad pinch (at the pointer), Safari gesture events, two-finger touch pinch (at the midpoint), and − / + / fit (at the view centre). Range: fit-whole-sheet to 160 %. Fit uses the full view. The label shows the percent. | [Prop] | e2e (Chromium, Firefox, WebKit) + owner check (Safari trackpad) | — |
| R6 | A minimap at the bottom right shows the grid, every window and the current view. Click or drag moves the view. With focus, arrow keys move the view. | [Prop] | e2e | — |
| R7 | Eight windows (five projects, three Quick tools) at the home positions and sizes in the layout table (Approach). Demo areas are inert placeholders of the reserved size. Pressing a window brings it to the front. | [Prop] | e2e | — |
| R8 | Window drag and throw follow the physics in Approach. | [Prop] | unit + e2e | — |
| R9 | Home: double-click on a title bar, or the window's Home control (keyboard and single pointer), flies the window home. | [Prop] | e2e | — |
| R10 | While a window is held within 56 screen px of a view edge, the sheet scrolls at a rate in screen px per second (frame-rate independent). The held point stays under the pointer. | [Prop] | e2e | — |
| R11 | The overlay card (fields in Approach) is generated into the HTML at build time from `content/identity.json`, escaped. Email has Copy with a fallback. | [Prop] | unit + e2e | — |
| R12 | The card's project list and Quick tools icons move the view to the window's current position, centred in the navigation area (beside the card on desktop, below the folded bar on phones), and move focus to the window. They never move the window. The list marks the project nearest the centre of that navigation area; opening or closing the card does not change the mark (amended by 009). | [Prop] | e2e | — |
| R13 | Reset page cancels any gesture and animation, flies every window to its home position, sets the start zoom (100 %, or the phone fit of R15), and frames CastleSiege's home position. | [Prop] | e2e | — |
| R14 | The five project windows show title, year, status, summary, stack and links from an ordered allowlist of `content/projects/*.md` files. | [Prop] | unit + e2e | — |
| R15 | At widths ≤ 760 px the card folds into a bar with an "about" toggle (Escape closes it, focus returns to the toggle). The sheet opens zoomed so CastleSiege's full width is on screen. | [Prop] | e2e (mobile) | — |
| R16 | Every visitor gets the same layout. Window positions, zoom and view are not saved. | [Prop] | e2e | — |
| R17 | With reduced motion, landing math is unchanged but every move commits at once: throw, Home, Reset, navigation, zoom buttons, glide. No tilt or wobble. A preference change mid-motion ends the motion at its target. | [Prop] | e2e | — |
| R18 | Light and dark themes follow `prefers-color-scheme` with mock v0.6 palettes. Text meets 4.5:1 (normal) or 3:1 (large, ≥ 24 px); focus rings meet 3:1 against their background. | [Prop] | unit (contrast table) + e2e | — |
| R19 | Keyboard: every window is a named region (its title), reachable by Tab in project-list order. A focused window comes into view without a second scroll. Arrow keys with Alt move a focused window by 24 sheet px; Home sends it home. Focus is always visible and never hidden under the card. | [Prop] | e2e | — |
| R20 | The page matches mock v0.6, except the differences listed in Approach (deferred to 002–006) and the two fixed mock defects. | [Prop] | compare-vs-mock | — |
| R21 | Only one gesture is active at a time (Approach, gestures). `pointercancel`, lost pointer capture and window blur end the gesture with no throw. | [Prop] | e2e | — |
| R22 | Budget: `/next` JS + CSS ≤ 100 KiB gzip (fonts excluded). No demo or app assets load in 001. No animation-frame callback runs while nothing moves. | [Prop] | build + e2e | — |

### Acceptance

- **R1.a** Given a production build, when `/next` loads, then the overlay card and the CastleSiege window are visible.
- **R1.b** Given the same build, when `/` loads, then the old OS boots (the existing desktop e2e passes).
- **R1.c** Given `npx wrangler dev` on `dist/` (local, no deploy), then `/next` returns the sheet, `/next.html` and
  `/next/` reach the same page with working assets, `/resume` works, and `/nope` returns 404.
- **R2.a** Given `/next`, when the page and its idle work finish, then every request is same-origin, and none asks
  for `system.img.json` or an `app-*.js` chunk.
  **Amendment 2 (approved 2026-10-22):** from spec 002 on, `app-*` JS/CSS requests are allowed only for apps
  whose windows meet the 002 R11 start rule; the check uses 002 R11.a's expected set. `system.img.json` stays
  forbidden. (From the task-list review, 2026-10-22.)
- **R2.b** Given the build, a plugin lists every module bundled into the `next` entry's chunks (static, dynamic and
  preloaded, including shared chunks and CSS) and fails if one is under `src/kernel/`, `src/fs/`, `src/wm/` or
  `src/boot/`. Modules under `src/apps/` may appear only in chunks reached through a lazy import that the app host
  (spec 002) registers; in 001 there are none, so any `src/apps/` module fails the build. A fixture with a forbidden
  import makes the build fail. (Amended 2026-10-22 after the 002 critique, finding 4.)
- **R2.c (Amendment 1, approved 2026-10-22)** The six Castle Wars sprite PNGs and their Aseprite JSON in
  `src/apps/castlewars/art/` may be imported as assets and build-time data (spec 005). No other file under
  `src/apps/castlewars/` may appear. A fixture with these assets passes the check; a fixture importing any other
  `src/apps/` module outside the 002 registry fails. (From the 005 critique, finding 1.)
- **R3.a** Given JavaScript off, at 1440 × 900 and 390 × 844, when `/next` loads, then name, role, tagline, Resume,
  GitHub, LinkedIn and the email are visible and the links work.
- **R4.a** Given the start view, when the mouse drags the paper 200 screen px left, then `scrollLeft` grows by 200
  ± 1 before any glide.
- **R4.b** Given focus on the sheet, when ArrowRight is pressed, then the view moves right. Given focus in a text
  field, then ArrowRight does not move the view.
- **R5.a** Given zoom 100 % and the pointer over sheet point S, when ⌘/Ctrl + wheel zooms in, then S stays under the
  pointer within 1 screen px, unless the scroll limit prevents it (then the view clamps).
- **R5.b** Given 1440 × 900 and 390 × 844, when fit is pressed, then the whole sheet is visible. After a resize or
  rotation that makes the current zoom smaller than fit, zoom becomes fit.
- **R5.c** Given zoom 160 %, when + is pressed, then zoom stays 160 %.
- **R5.d** Given one pinch (wheel with ctrlKey, or Safari `gesturechange`), then zoom changes once per event, never
  twice. Safari trackpad: owner-reported, else **Unverified**.
- **R6.a** Given the start view, when the minimap is clicked over the Quick tools, then the view moves there.
- **R7.a** Given two overlapping windows, when the lower one is pressed, then it draws above the other.
- **R7.b** Given the build, each window's size equals the layout table within 2 px.
- **R8.a** Given a window held at point P (window coordinates), when the mouse moves in 20 steps, then after each
  step P is within 1 screen px of the pointer, at zoom 100 % and 50 %, and at a sheet edge.
- **R8.b** Unit fixtures, independent of the code: v = (1000, 0) sheet px/s, unclamped → translation 103.76 ± 0.01
  px at 0.24 s; v = (5000, 0) → capped at 360 px; v = (600, 800) → 103.76 px along that direction; a throw toward an
  edge → stops with the whole window inside the sheet; last sample older than 50 ms → no flight; no motion → no
  flight. After 2τ the translation does not change.
- **R8.c** Given the largest throw (360 px), then from 0.8 s after the pin onward |θ| < 0.05° and |θ'| < 0.5 °/s
  (spec 009 R3.a; was 1.0 s).
  The same holds for a window caught and re-thrown while it still wobbles.
- **R9.a** Given a window away from home, when its title bar is double-clicked or its Home control is used, then it
  ends at its home position.
- **R10.a** Given a window held 20 px from the right edge with the pointer still, when 1 s passes at 60 Hz and at
  120 Hz, then `scrollLeft` grows by the same amount ± 10 %, and on release the window does not fly.
- **R11.a** Given a test copy of `identity.json` with changed name and a `<` in the tagline, when the page builds,
  then the raw HTML shows the new name and the escaped tagline.
- **R11.b** Given Copy is pressed and the clipboard is refused, then the address is selected and a message says to
  press ⌘C or Ctrl+C.
- **R12.a** Given Insider Trading was thrown elsewhere, when it is chosen in the card, then the view centres on its
  new position and it has focus.
- **R12.b** Given the view centred on Pentimento, then "Pentimento" is the marked list item. On a phone at the start
  view, opening and closing the card leaves CastleSiege marked (amended by 009).
- **R13.a** Given CastleSiege thrown out of view and zoom 50 %, when Reset page is pressed, then every window ends at
  home, zoom is the start zoom, and CastleSiege's home is in view. Reset pressed twice, or during a drag, gives the
  same end state.
- **R14.a** Given the allowlist (castlesiege, castlewars, pentimento, focused-web-crawler,
  polymarket-insider-trading), then the windows appear in that order and Whole-Plant Ice Cream is not read.
- **R14.b** Given an allowlisted file with a missing or empty `summary`, a `status` outside
  {playable, in-progress, planning, demo-coming}, or `summary: |`, then the build fails and names the file and field.
- **R15.a** Given 390 × 844 touch, when `/next` loads, then the card is a bar and CastleSiege's full width is on
  screen.
- **R16.a** Given a window moved and the page reloaded, then the window is at home.
- **R17.a** Given reduced motion, when a window is thrown, Home or Reset is used, or a zoom button is pressed, then
  the end state is reached at the next frame with rotation 0.
- **R18.a** A unit test computes the contrast of every token pair the page uses and fails below the R18 limits.
- **R19.a** Given the page loaded, when Tab moves through the card and into the windows, then each stop has a
  visible focus ring, each window comes into view when focused, and its accessible name is its title.
- **R19.b** Given a window has focus, when Alt + ArrowRight is pressed, then it moves 24 sheet px right.
- **R20.a** compare-vs-mock pass 1 (1440 × 900 and 390 × 844, light and dark, start view and after Reset) lists no
  difference outside Approach's list.
- **R21.a** Given a window held with one finger, when a second finger touches the paper, then the drag continues and
  no pinch starts. Given a pinch, when one finger lifts, then the gesture ends with no pan jump.
- **R21.b** Given a window held, when `pointercancel` fires or the page loses focus, then the window stays where it
  is with no throw.
- **R22.a** The build reports `/next` JS + CSS gzip size ≤ 100 KiB. With the page idle for 2 s, then a performance
  trace shows no animation-frame callbacks.

## Approach

- **Files.** `next.html`. `src/sheet/`: `main.ts`, `physics.ts` (pure), `windows.ts`, `gestures.ts` (the one-gesture
  owner), `view.ts` (pan, zoom, minimap, panTo, nearest), `layout.ts`, `sheet.css`. `vite.config.ts`: add the `next`
  input; an HTML transform for the card (R11); a virtual module with the project data (R14) that exports plain data
  and watches the source files; the forbidden-import check (R2.b). Content: add `summary` and `status` to the five
  files; add `content/projects/castlewars.md`. Fonts: Instrument Sans 400/500/600 woff2 and its OFL license from
  `@fontsource/instrument-sans` (dev dependency) into `public/fonts/`, beside the Pixel Operator CC0 notice.
- **Reuse.** Port `docs/mockups/rargu-os-src/part2.js` into typed modules, with the fixes this spec lists.
- **Card fields.** name ← `name`; role ← `title`; tagline ← `tagline`; GitHub ← `links.github`; LinkedIn ←
  `links.linkedin`; email ← `email`; Resume → `/resume`; project list ← the allowlist titles; Quick tools labels ←
  the layout table.
- **Layout table** (sheet px, measured in the mock 2026-10-22; demo area = reserved placeholder height):

  | Window | x | y | w | h | demo h |
  |---|---|---|---|---|---|
  | castlesiege | 360 | 100 | 620 | 654 | 427 |
  | castlewars | 1040 | 140 | 600 | 522 | 314 |
  | pentimento | 1720 | 80 | 600 | 635 | 404 |
  | crawler | 400 | 860 | 680 | 522 | 265 |
  | insider | 1160 | 800 | 680 | 551 | 320 |
  | paint | 1920 | 760 | 434 | 350 | 313 |
  | music | 2400 | 700 | 556 | 348 | 311 |
  | notes | 1920 | 1150 | 424 | 364 | 327 |

  **Proposed, pending owner review of mock v0.7 (spec 004 T1; not in `layout.ts` yet).** Measured in Chromium at
  scale 1 (`tests/e2e/quick-tools-measure.spec.ts`): outer = manifest client + 4 border + 33 title bar + 27 menu row;
  demo h = 27 menu row + client h. Inside 3000 × 1640, clear of each other, of the five project windows above and of
  the title block (2761, 1461, 197 × 137). If the owner approves v0.7, these replace the three rows above (004 T2).

  | Window | x | y | w | h | demo h | client (manifest) |
  |---|---|---|---|---|---|---|
  | paint (proposed) | 1920 | 760 | 434 | 350 | 313 | 430 × 286 |
  | music (proposed) | 2400 | 700 | 556 | 348 | 311 | 552 × 284 |
  | notes (proposed) | 1920 | 1150 | 424 | 364 | 327 | 420 × 300 |

  Later specs may change sizes (for example the real Tracker in 004) and update this table and the mock.
- **Physics** (owner, 2026-10-22; kick and ζ changed by spec 009, the held lean restored without the lift scale by
  spec 010, owner 2026-10-24). Held: the grab point P follows the pointer exactly; the window leans about P toward
  θ = clamp(−0.012·torque(r, release velocity), −12°, 12°) with ζ = 0.65, and ends at exactly 0 when the pointer is
  still; no scale while held. Torque = (rx·vy − ry·vx) / (hypot(rx, ry) +
  1), r = window centre − P, v in sheet px/s. Release velocity: pointer motion over the last 80 ms, in sheet px/s,
  excluding sheet auto-scroll; 0 if the last sample is older than 50 ms. Flight: x(t) = x0 + v·τ·(1 − e^(−t/τ)),
  τ = 0.12 s, stop at 2τ; distance capped at 360 sheet px; landing clamped so the window is inside the sheet. Pin:
  angular-velocity kick = sign(t)·2.5°·ln(1 + |t|/150)·ω, where t is the torque of the pin velocity
  ((L − x0)·e^(−2)/(τ·(1 − e^(−2))) per axis); added to the current angular velocity. Free oscillator: ω = 2π·2.6,
  ζ = 0.45; stop when |θ| < 0.05° and |θ'| < 0.5 °/s. Long flights (Home, Reset, distance > 360 px) use
  τ = min(0.3, 0.12 · d / 360) s with the same pin rule.
- **Gestures.** One owner at a time. A press on a title bar starts a window drag and ignores further pointers until
  it ends. A press on the paper starts a pan; a second touch on the paper turns it into a pinch; lifting to one touch
  ends the pinch (no pan jump). Presses on controls, inputs and demo areas belong to that content (on touch, a pan
  may start from a demo area placeholder in 001; 002 takes demo areas). Wheel: normalize `deltaMode` (lines × 16,
  pages × view height); ctrl/meta + wheel zooms and calls `preventDefault`; Safari `gesturestart/change/end` zoom and
  suppress the matching wheel events.
- **Spec 009 and 010 differences** allowed by R20 (owner, 2026-10-24): a held window leans as in the mock but does
  not scale (the mock lifts it × 1.03), and the pin wobble is smaller (kick 2.5°, ζ = 0.45; the mock: 4°, 0.34). The start view
  and the view after Reset are unchanged.
- **Deferred differences** allowed by R20: demo areas are placeholders (002–006); Quick tools windows are empty
  (004); Castle Wars sprites and Pentimento sketch (005); crawler and insider demos (006).
- **Rejected:** a UI framework; a canvas-drawn sheet (no selectable text, no no-JS content); saving positions
  (owner).

## Boundaries

- **Always:** keep `/` and `/resume` working; run lint, unit, `npm run e2e` and the Firefox/WebKit projects before a
  task is called done; respect reduced motion; keep the page static.
- **Ask first:** any new runtime dependency; any change to the old OS code; `git push`.
- **Never:** deploy (spec 007); load a third-party resource; save visitor state; touch `art-source/`.

## Out of scope

- Live demos (002–006), the app host (002), removing the old OS and deploying (007).
- Link-preview tags for `/next` beyond title and description (007 moves them to `/`).

## Open questions

- None. Decisions are in OWNER_QUESTIONS (2026-10-22).

## Approval record

2026-10-22 — Owner approved spec 001 as written ("approve 001"), including the R2.b amendment from the 002
critique. Decisions: OWNER_QUESTIONS rows of 2026-10-22 (layout, physics, overlay card, zoom and minimap, phone fit,
font self-hosting, contrast fixes / mock v0.6, app scale 1, five projects only). No gate approved.
2026-10-22 — Owner approved Amendment 1 (R2.c, Castle Wars sprite assets) with specs 002–007 ("Approve all").
2026-10-22 — Owner approved Amendment 2 (R2.a: app chunks allowed after 002 only per the 002 R11 start rule).
2026-10-22 — During T2 the owner allowed `castlewars.md` to appear in the old OS Projects folder (R1 note) and
approved the `@fontsource/instrument-sans` dev dependency (OWNER_QUESTIONS).

## Advisor decisions (overnight run)

2026-10-23 — Decided by the Fable advisor for the owner (T6). Problem: at 390 × 844 the R15 phone fit (58 %) puts
CastleSiege's title bar (home y = 100) under the folded card bar (ends at y ≈ 65); clearing the bar needs zoom ≥ 0.65,
full width needs ≤ 0.58. Decision (option A): on ≤ 760 px the scroller has a top inset equal to the folded bar's
rendered height + 16 px, so the sheet's top row can clear the bar at the R15 fit. Reset and card navigation on phones
put the window's top edge just below the bar; an e2e checks CastleSiege's title bar is fully below the bar. Sheet
size, layout table, desktop and the R15 fit are unchanged. Implementation detail; no requirement text changed.
Rejected: moving every home down (changes the layout table and the desktop view), a larger phone fit (breaks R15),
accepting the overlap (breaks R19). Owner to confirm.

2026-10-23 — Decided by the Fable advisor for the owner (T7). Problem: on desktop the card covers screen x 0–320 at
scroll 0, so a window moved to sheet x < ~344 (Alt+Arrow or a throw) cannot be shown beside the card and R19 ("never
hidden under the card") fails. Decision (option A, mirrors the phone inset): on > 760 px the scroller has a left
inset = the card's rendered right edge + 24 px and a top inset of 24 px, re-measured on resize. Start view and Reset
scroll to (inset, inset) at 100 %, so the first screen is the same as before. Fit still uses the full view (R5); the lead agent withdrew a "fit minus the insets" condition because it conflicts with R5.
An e2e checks a window moved to the left edge is revealed beside the card. Layout table, sheet size, physics and
R19 text unchanged. Rejected: clamping landings out of the card's column (breaks "any window can go anywhere"),
reading R19 narrowly or amending it. Owner to confirm.

2026-10-23 — Layout table change from spec 005 T5 (allowed by Approach: "Later specs may change sizes"): Pentimento
h 542 → 635, demo h 311 → 404 (the mock's height after a run), decided by the Fable advisor for the owner. See 005
"Advisor decisions". Mock not changed; a v0.7 bump is the owner's call.

2026-10-23 — Layout table change from spec 006 T3/T4 (lead decision, following the 005 Pentimento advisor
precedent; allowed by Approach "Later specs may change sizes"): crawler h 496 → 522 (demo 264 → 265), insider h 511
→ 551 (demo 280 → 320), so the demos keep the mock's inner sizes with the real project text (Codex 006 T3/T4 #2).
Both windows stay inside the sheet and clear of neighbours (e2e). Owner to confirm.

2026-10-23 — Layout table change from spec 003 T1 (measured, as 003 T1 requires): castlesiege h 619 → 658, demo
388 → 427, so the wide layout shows the board at 40 px cells (as the mock) with the 002 menu row. Ends at sheet y
758, clear of the crawler (860).
2026-10-23 — 003 T8 compare-vs-mock D1: castlesiege h 658 → 654 (the 658 left a 4–5 px strip under the status bar;
654 is the only integer that cuts nothing in Chromium, Firefox and WebKit). Mock v0.7 (pending owner review) still
shows 658; update it with the owner's v0.7 review.

2026-10-24 — **Owner decisions:** R22 budget raised to 150 KiB gzip ("performance comes before size"; the guard
still fails above it; responsiveness checks unchanged). Card project list uses an optional `short` frontmatter field
(CastleSiege, Castle Wars, Pentimento, Focused Crawler, Insider Trading) so no title wraps; window titles keep the
full title. Windows wider than a phone screen: ignored for now (assume landscape). No close button on sheet windows:
OK for now.

2026-10-24 — Layout table: Quick tools rows from 004 T1/T2 (mock v0.7, approved by the owner 2026-10-24).
