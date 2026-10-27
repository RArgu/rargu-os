# 014 tasks

Ordered by dependency. Check a box only after its verification has run. Each task: write the test first and see it
fail, then implement (`ponytail`), then run `npm run lint`, `npm test` and the named e2e (under the shared e2e lock,
`CI=1`). No new dependency, no network from the site or the build.

- [x] **T1** Colour table, sources and checks (R1, R2, R8)
  - Acceptance: `content/stack-colours.json` with every chip of the sheet's projects and the 011/012 candidates, each
    a sourced colour, a one-hop `same` or a neutral; the header with Linguist and Simple Icons provenance;
    `content/licences/linguist-LICENSE.txt` at the pinned commit. `scripts/stack-colours.ts` loads and checks it:
    unknown chip, bad hex, `same` to itself, to a `same`, to a neutral or to nothing all fail with the file and name.
  - Verify: `npm test` (R1.a, R2.a–c, R5(a) Linguist constants).
  - Files: `content/stack-colours.json`, `content/licences/linguist-LICENSE.txt`, `scripts/stack-colours.ts`,
    `tests/unit/stack-colours.test.ts`.
- [ ] **T2** OKLCH tint (R3)
  - Acceptance: light L 0.93 / C ≤ 0.07, dark L 0.36 / C ≤ 0.09, gamut map by chroma only, byte rounding; the R3.a
    outputs exactly; hue within 2° for C ≥ 0.02; the build fails under 4.5:1 (R3.b).
  - Verify: `npm test` (R3.a, R3.b, R5(b), R5(c)).
  - Files: `scripts/stack-colours.ts`, `tests/unit/stack-colours.test.ts`.
- [ ] **T3** Split chips, render and CSS (R4, R6, R8, R9, R10)
  - Acceptance: castlesiege lists React Native, Expo, Fly.io, Docker as four chips; one `chip()` function renders
    `--chip-l` / `--chip-d` in the window and the Read panel; `.chip` uses them, with the dark media rule and a print
    rule; neutral chips keep `--chip`; an unknown chip fails `npm run build`.
  - Verify: `npm test` (R5(d), R8.a, R10.a); `npm run build`.
  - Files: `content/projects/castlesiege.md`, `scripts/sheet-content.ts`, `src/sheet/sheet.css`,
    `tests/unit/stack-colours.test.ts`, `tests/unit/sheet-content.test.ts`.
- [ ] **T4** Chips in the browser (R4, R5, R9)
  - Acceptance: every chip in the windows, in a visible Read panel and on `/p/<id>/` without JavaScript has its
    expected background and ≥ 4.5:1 text, in light, dark and light again with no reload; print removes backgrounds.
  - Verify: `npm run e2e` (R4.a, R5.a, R5.b, R9.a); `npm run e2e:all` for the new file.
  - Files: `tests/e2e/stack-chips.spec.ts`, `tests/e2e/compact-stack-chips.spec.ts`.
- [ ] **T5** Mock v0.8 (R11)
  - Acceptance: the v0.7 sources are frozen as `docs/mockups/rargu-os-src-v0.7/` (they still build the v0.7 hash);
    `rargu-os-src/` builds `rargu-os-v0.8.html` with only the chips changed (colours and the split chips);
    `docs/mockups/README.md` names v0.8 as current with its hash.
  - Verify: `python3 -I docs/mockups/rargu-os-src-v0.7/build.py` matches the v0.7 hash; `python3 -I
    docs/mockups/rargu-os-src/build.py` writes v0.8; the v0.7 → v0.8 source diff touches only chips (R11.a).
  - Files: `docs/mockups/rargu-os-src-v0.7/`, `docs/mockups/rargu-os-src/`, `docs/mockups/rargu-os-v0.8.html`,
    `docs/mockups/README.md`.
- [ ] **T6** Check before review
  - Acceptance: `npm run e2e:all` passes; compare-vs-mock against v0.8 (1440 × 900 and 390 × 844, light and dark)
    lists only allowed differences; the ledger records the results.
  - Verify: `npm run lint`, `npm test`, `npm run e2e:all`, `npm run build`, `compare-vs-mock`.
  - Files: `docs/review/spec-014-mock-vs-build.md`, `docs/ledger/2026-10-26-spec-014.md`.
