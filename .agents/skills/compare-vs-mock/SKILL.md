---
name: compare-vs-mock
description: >
  Compare the working site with the approved HTML mock in docs/mockups/, view by view: screenshot the mock and the
  build at the same viewports with Playwright, put them side by side, and list every difference with its reason
  (later spec, owner decision, real-data stand-in, font, or defect), layout and order first. Use for
  "/compare-vs-mock", "compare with the mock", "mock vs build", or after UI work before showing the owner.
---

<!-- Ported from RETVController (written there 2026-10-15 for Android emulators) on 2026-10-22 and rewritten for a
web build: Playwright instead of adb and headless Chrome. pair.py is unchanged. Our own words and scripts. -->

# Compare vs mock

The mock is the source of truth for layout. Where a later ruling or the approved spec changed something, the
**mock** is updated (a new versioned copy, never an edit of the approved file), then the build must match it.

## Before you start

- Know the baseline: `docs/mockups/README.md` names the current mock file and its hash. The spec names the views and
  states to compare.
- The mock loads Google Fonts. Rendering it needs the network for that one host. Nothing is uploaded.
- Build what the owner will see: `npm run build && npm run preview` (or `npm run dev` for a quick pass, and say so).

## Steps

1. **Shoot both** at each viewport (default: 1440×900 desktop and 390×844 phone, light and dark):
   `node .agents/skills/compare-vs-mock/scripts/shot.mjs <url-or-file> <outdir> [WxH[@dark] ...]`
   Use the mock as `file://<repo>/docs/mockups/<file>.html` and the build as the preview URL. For a state that needs
   input (a panned or zoomed view, an open card, a thrown window), drive it the same way in both, or note it as not
   compared.
2. **Side by side:** `python3 -I .agents/skills/compare-vs-mock/scripts/pair.py <out.png> <mock.png> <build.png>`.
   Keep images in the scratchpad. Show the owner a local HTML page of the pairs, not a published one, unless they ask.
3. **Diff pass, in this order:** (a) which windows and controls exist; (b) grouping (what sits in which window or
   card); (c) position (home coordinates on the sheet, fixed overlays, alignment); (d) spacing (gaps, gutters,
   heights); (e) type (face, size, weight); (f) colour, borders, shadows, icons; (g) text; (h) motion (drag, throw,
   wobble, zoom), checked by hand and described, since screenshots do not show it.
4. **Give each difference a reason:** not built until spec X · owner decision (cite OWNER_QUESTIONS or the spec's
   approval record) · spec text (R#) · real engine or data replaced a mock stand-in · font · **defect**. A defect is
   anything the spec wants that no reason covers. If the mock itself is out of date because of a ruling, propose a
   mock edit instead.
5. **Write it down:** `docs/review/<spec>-mock-vs-build.md`, a new "Pass N" section each run: what was compared (mock
   file + hash, commit, viewports, themes, browser), a table of proposed fixes with IDs (D# defects, L# layout, J#
   owner decisions), what already matches, and limits (not checked, sizes by eye).
6. **Stop and show the owner** the page and the list. No fix before the owner approves the list (and any mock edit:
   it changes the baseline; record it in the spec's approval record).
7. **After approved fixes:** re-shoot the touched views and write the next pass with each ID's result.

## Updating the mock

Never edit the approved file. Make a new versioned copy beside it, change only what is in scope, record the edit and
the new hash in `docs/mockups/README.md`.

## Limits to state every time

Browsers not checked (Safari, Firefox), touch behaviour if only desktop was shot, reduced-motion, and that motion was
judged by hand.
