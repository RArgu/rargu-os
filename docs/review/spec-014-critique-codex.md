# Spec 014 critique (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config`, read-only, ephemeral
- Model: gpt-6.1-sol, reasoning effort high
- Session id: 01a17a98-bbdc-7de3-8fa6-dc93f87d2a7e · tokens used: 79,081
- Date: 2026-10-26 · Spec: `docs/specs/014-stack-chip-colours/spec.md` (Draft, uncommitted) on branch `spec-014-chips`
  at `bed40e2`

## Dispositions

Checked by the 014 lead on 2026-10-26. No owner decision was changed.

| # | Severity | Disposition | Why |
|---|---|---|---|
| 1 | High | Accepted | True: my own run of the draft rule found 24 of 54 tints outside sRGB; clipping moved hue up to about 21°. R3 now maps to the gamut by lowering chroma only (binary search), rounds to bytes, and measures on the final hex. Re-run (derived): maximum hue shift 1.4° for C ≥ 0.02; contrast at least 11.0:1 light, 9.4:1 dark. R3.a now lists exact outputs for Python, Metal, Ollama and DuckDB. The step-L loop is dropped (it never ran); the build asserts 4.5:1 and R3.b tests that failure. |
| 2 | Medium | Accepted | asyncio → Python stays (the owner asked the spec to propose). Requests and Pillow are now NEEDS OWNER Q6. "Anthropic API" defaults to the sourced Anthropic colour; Claude coral is option (b) of Q5. |
| 3 | Medium | Accepted | R5 now asserts the Linguist values against constants in the test, exact R3 outputs, chip counts and labels, two different technologies, the alias and a neutral chip; R2 makes `same` one hop with self and chain rejected (R2.c). |
| 4 | Medium | Accepted | True: Read panels start hidden and `/p/<id>/` has its own no-JS CSS (`scripts/p-pages.ts`). R5's e2e now covers the window, the visible Read panel, `/p/<id>/` with JavaScript off, and light → dark → light with expected values. |
| 5 | Medium | Accepted | Each direct colour now needs a full URL, a revision and the extraction detail; Simple Icons rows name both sources; the Linguist licence text is kept as `content/licences/linguist-LICENSE.txt`. Linguist v9.7.0 and commit `e0c78d6…` and the licence line were observed with `gh api` on 2026-10-26. |
| 6 | Low | Accepted | New R9: print removes chip backgrounds (black text, border); forced colours are left to the browser. |

## Codex output (verbatim)

1. **High — R3 cannot preserve the specified hue when converted to hex.**  
   [014-stack-chip-colours/spec.md:107](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:107), [acceptance:120](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:120)

   **Observed:** An independent `python3 -B -c` calculation found out-of-sRGB results for 20 of the 27 distinct source colours in light mode, and four in dark mode. Python’s light tint produces linear RGB approximately `(0.54291, 0.84945, 1.20589)`.

   **Derived:** Hex cannot represent that blue channel. Clipping and rounding produces `#c3edff`, with a hue shift of approximately **20.7°**. This fails R3.a’s **2°** limit. The chroma caps do not guarantee valid sRGB colours.

   **Fix:** Specify the conversion equations and gamut mapping. Reduce chroma until the colour fits sRGB while preserving lightness and hue. Define byte rounding, then measure contrast and hue from the **final serialized hex**. Define integer lightness steps, endpoint handling, and achromatic hue handling. Add expected outputs for Python, saturated colours, black, and yellow.

2. **Medium — Some proposed mappings depart from the owner’s own-brand rule.**  
   [014-stack-chip-colours/spec.md:69](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:69), [Q5:162](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:162)

   **Observed:** The draft assigns Python’s colour to Requests and Pillow without a source for their asserted lack of brand colour. Q5 recommends Claude’s coral for the chip named “Anthropic API.”

   **Derived:** Python implementation language does not establish a library’s brand colour. Substituting Claude’s colour also needs an explicit exception to the owner’s rule.

   **Fix:** Keep `asyncio → Python` with its standard-library explanation. Give Requests and Pillow sourced mappings or explicitly approved fallback treatment. Use the sourced Anthropic colour unless the owner approves the substitution. Record these exceptions separately from established owner decisions.

3. **Medium — The acceptance checks can pass with incorrect technology colours.**  
   [014-stack-chip-colours/spec.md:116](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:116)

   **Observed:** R1.a checks metadata. R3.a checks contrast and only Python’s hue. R4.a compares Python’s background with its own custom property. R8.a checks equality between repeated TypeScript chips.

   **Derived:** A faulty resolver that gives every coloured chip Python’s backgrounds can satisfy these checks. Incorrect Linguist values can also pass the contrast tests.

   **Fix:** Assert the exact pinned language values independently of the production table. Add rendered-output checks for at least two distinct technologies, one alias, and one neutral entry. Assert complete expected chip counts and labels before iterating. Keep aliases one hop to a coloured entry, and test rejection of self-references and invalid targets.

4. **Medium — Browser acceptance does not establish coverage of Read or no-JavaScript pages.**  
   [014-stack-chip-colours/spec.md:109](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:109), [scripts/p-pages.ts:17](/Users/rargu/DevPageOS-013/scripts/p-pages.ts:17)

   **Observed:** Read panels start hidden. `/p/<id>/` reuses the sheet HTML and supplies separate no-JavaScript display rules. The draft names neither these routes nor a JavaScript-disabled test.

   **Derived:** “Every chip on the page” can omit hidden Read panels if the test selects visible elements. It does not establish that the direct-entry page remains correct without JavaScript.

   **Fix:** Require visible checks in the window and Read panel, plus each generated `/p/<id>/` with JavaScript disabled. Test light → dark → light without navigation. Assert expected backgrounds as well as contrast, using polling after `emulateMedia`. Reuse the existing no-JavaScript fixtures.

5. **Medium — Source and licence records need a reproducible form.**  
   [014-stack-chip-colours/spec.md:77](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:77), [R1:105](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:105)

   **Observed:** Several sources are descriptions rather than exact references: “Chromium `product_logo.svg`,” “Playwright logo SVG,” and “docker.com media resources.” R1 requires licence labels and copyright metadata, but no retained upstream licence text.

   **Derived:** A later reviewer cannot reliably reproduce those selections or inspect the applicable notices from the required artifact.

   **Fix:** Require a complete source URL per direct colour, with an immutable revision where available. Record the selected SVG fill or other extraction detail. Retain the pinned Linguist licence and relevant notices alongside the data. Distinguish Simple Icons metadata from the underlying brand source. Verify the asserted versions, commits, and notices before approval.

6. **Low — Print and accessibility colour overrides have no stated behavior.**  
   [014-stack-chip-colours/spec.md:108](/Users/rargu/DevPageOS-013/docs/specs/014-stack-chip-colours/spec.md:108)

   **Observed:** The draft specifies only light and dark media rules. Current stack chips are ordinary spans, without hover or focus states ([scripts/sheet-content.ts:346](/Users/rargu/DevPageOS-013/scripts/sheet-content.ts:346)).

   **Inferred:** Dark-theme printing with backgrounds omitted could leave pale chip text. Forced-colour output depends on browser overrides and should not be judged against brand hex values.

   **Fix:** State that forced colours may replace decorative tints. Preserve automatic system-colour adjustment and check readable labels. Specify a simple print foreground/background treatment and test with background printing disabled. No new chip hover or focus behavior is needed.

**Contrast assessment — derived:** Using standard conversion, channel clipping, and nearest-byte rounding, the independent calculation found minimum contrast of approximately **10.45:1 light** and **9.23:1 dark**. Both neutral chip pairs also exceed 10:1. These results use the current `--ink` tokens. Contrast has ample margin, but clipping violates the hue requirement.

**Completeness and complexity — observed/derived:** The inventory includes all current stack names. The two combined names still need Q2 resolved before exact-key validation can pass. Exact matching plus explicit aliases is sufficient. The shared build-time renderer is appropriate and keeps the site static. The lightness adjustment loop never activates for the calculated current colours. Either test its adjustment and failure branches with controlled foregrounds, or simplify it to a build-time contrast assertion.

**Could not check:** No implementation exists yet to verify rendered output. I did not verify upstream colours, versions, commits, or licence text because network actions were prohibited. I did not run build, unit, or browser suites because their configured commands generate files. No files were modified.