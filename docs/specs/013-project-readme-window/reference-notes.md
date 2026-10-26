# 013 reference study: monicagraham.dev/codex-cad

Studied 2026-10-26 in Chromium with `chrome-devtools-axi` (snapshot, DOM queries, screenshots at 1440 × 900 and
390 × 844). Everything here is **observed** unless marked **inferred**. Screenshots are in the session scratchpad,
not in the repo. We take the pattern only. We do not copy its text or its visual design.

## Routing

- The write-up is its own route, `/codex-cad`. It is a full page, not an overlay.
- The home page lists "Selected Projects" as four plain links: `/codex-cad`, `/battlebots`, `/mujoco-quadruped`,
  `/grahamsgallery`.
- A top bar has "Back to Portfolio" (link to `/`) and "View on GitHub", with a thin rule under it. Browser Back works.
- **Inferred:** a single-page app with client routes. The document title stays "Monica Graham - Portfolio" on every
  route, so each write-up has no own title for sharing or search.

## Structure (in order)

| # | Part | Size | Notes |
|---|---|---|---|
| 1 | Title (h1) and lede | about 7 + 35 words | The lede says what was built and why it matters, in 2 sentences |
| 2 | "From sketch to engineering drawing" | about 32 words | A tab gallery: 5 tabs, one screenshot (1440 × 900 PNG) and a one-line caption each. "View full size" opens a lightbox |
| 3 | "Shared parametric editing" | about 52 words | 2 short paragraphs. The second states the main design problem |
| 4 | "Shared state and validated operations" | about 64 words | The system diagram and a one-line caption |
| 5 | "Testing state consistency and recovery" | about 38 words | 1 paragraph: how it was tested |

- Total: about 231 words, under 2 minutes of reading. The screenshots carry most of the content.
- Headings are claims ("Shared state and validated operations"), not labels ("Architecture").
- The sibling page `/battlebots` (282 words) has different sections (awards, a 2-tab block, videos). So the page
  shell and type are a template, but the sections change per project.

## The system diagram

- HTML and CSS, not SVG, image or canvas. The page has 0 `<svg>` elements. Markup: `figure.cad-figure >
  div.cad-architecture` with input, arrow, state and kernel parts.
- 3 tiers: two input boxes side by side, then one central box, then one bottom box. Text arrows "↓" and "↕" join the
  tiers.
- Each box has 3 lines: a small monospace label (the technology), a main name, and a grey line of keywords joined by
  "·".
- One box has a brighter border. It is the central part of the design. No numbers, no colour code.
- No hover, click, animation or step-through.
- At 390 px the two input boxes stack into one column. No sideways scroll.
- A one-line caption under the figure says what the diagram shows.

## Navigation, type and motion

- No table of contents, sticky nav, scroll spy or prev/next. The only in-page control is the tablist of the gallery.
  At 390 px its 5 tabs wrap onto 3 lines.
- Headings: serif ("Gowun Batang"), h1 67 px desktop / 43 px phone, h2 41.6 / 30.4 px. Body: sans (Manrope), 17.28 px
  on a 30 px line (1.75).
- Text column: about 738 px wide, about 70 characters a line. Content column about 912 px. Sections about 90 px apart.
- Phone: full width with about 18 px side padding. `scrollWidth` is 390 (no sideways scroll).
- Dark only. With `prefers-color-scheme: light` emulated, the page does not change.
- A `rise-in` entrance animation on the tab panel, with a `prefers-reduced-motion: reduce` rule.

## What to borrow for RArgu OS

1. **Short text.** A lede of 2 sentences, then short sections of 30 to 80 words. The figures carry the rest. Our
   draft write-ups target 400 to 600 words, because the owner also wants uses, challenges and his part.
2. **Diagram as HTML boxes in tiers.** Crisp at any zoom, real text (Find in page, screen readers), stacks at phone
   width, and takes our theme tokens with no extra work. It also matches the blueprint look: thin outline, a mono
   label, a name, a keyword line, one focal box.
3. **One caption under each figure** that says what it shows.
4. **A tab gallery** for screenshots (charts from the crawler evaluator, the insider notebooks). Optional.
5. **Text column near 68 characters, line height about 1.6.**
6. **Claim headings** are good to read, but our section nav needs short names. Proposal: short fixed names in the nav,
   with a claim sentence in bold at the start of each section (owner question Q5 in the spec).

## What not to borrow

- Heading sizes of 42 to 67 px. Too large for a window. Use our display font (Pixel Operator) at 24 to 32 px.
- The route-only model with "Back to Portfolio". Our write-up opens from its window and needs Restore and Esc. A route
  can still exist for sharing (spec Q3).
- One title for all routes. Each of our write-ups needs its own title and description if it gets a URL.
- Dark only. RArgu OS has light and dark (001 R18).
- No section nav. It works there only because the text is short (**inferred**). Ours is longer, so it gets a nav.
