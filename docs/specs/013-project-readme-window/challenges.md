# 013 challenges log

Real problems met while building 013, in the content-plan format (spec "Content plan"). Evidence: the ledger
`docs/ledger/2026-10-26-spec-013.md` and the commits named.

## 2026-10-26 — A window cannot be `position: fixed` where it is
- What happened: the sheet scales `#world` with a transform (`src/sheet/view.ts:151`) and each window has its own
  transform (`src/sheet/windows.ts:96`), so `position: fixed` on a window is fixed to its transformed ancestor, not
  the page.
- What we did: Expand moves the window's own node into a fixed layer `#lift` and back, with a same-size placeholder
  in the sheet; canvas, timers and listeners survive the move (T6, `83dfdd4`).
- Public: yes

## 2026-10-26 — Hosted apps swallow Esc
- What happened: the app host stops every keydown inside an app (`src/sheet/host/window.ts:316`), so a dialog
  handler never sees Esc in expanded CastleSiege; WebKit's plain Tab also skips buttons, so focus left the dialog.
- What we did: Esc restores unless the focus is in a tool or app area (002's Esc-then-Tab rule leaves it first);
  the dialog moves the focus itself between its stops in every browser (T7, `49c191e`).
- Public: yes

## 2026-10-26 — Relative asset URLs break under /p/<id>/
- What happened: the build uses `base: "./"` (`vite.config.ts:55`), so the sheet page copied to `/p/crawler/` would
  load `./assets/…` from `/p/crawler/assets/`. A standalone write-up page also cannot start the sheet.
- What we did: each `/p/<id>/` page is the built sheet page with its own head, `data-open` and absolute asset URLs;
  the build checks every asset resolves and that the JS and CSS are the sheet page's own (T9, `54db5ab`).
- Public: yes

## 2026-10-26 — Duplicate heading ids
- What happened: the markdown renderer gives every document `sec-overview`, `sec-results` and so on, so two
  write-ups on one page would share ids and the nav could jump to the other project.
- What we did: ids take the window id as a prefix (`crawler-sec-results`); a test checks the built page has no
  duplicate id (T1, `d5fa36b`).
- Public: yes

## 2026-10-26 — Key scroll differs in Firefox and WebKit
- What happened: in Firefox an arrow key the Read panel could not use scrolled the sheet behind it; in WebKit a
  focused panel did not scroll by keys at all. Found by the 011 track's `e2e:all`.
- What we did: the panel scrolls itself for arrows, Page keys, Space and Home/End, and takes Left/Right (T8,
  `9749017`).
- Public: yes

## 2026-10-26 — A flaky reduced-motion test
- What happened: the R5.c test failed about 1 run in 8 (reported by the 012 track): it checked one frame after
  turning reduced motion on, but the page's media change event can come later.
- What we did: the test holds the animation mid-way and waits on the change event, not on time; 60 runs in three
  browsers passed (`431539f`).
- Public: yes

## 2026-10-26 — Dark-theme lines under 3:1
- What happened: the mock comparison showed diagram box borders, the nav line and the notice border nearly
  invisible in dark mode: `--outline` is `#000000` on the dark window colour `#1d2b53`.
- What we did: lines in the Read panel use `--ink`; a unit test forbids `--outline` there (T13, `bed40e2`).
- Public: yes

## 2026-10-26 — The nav marked the wrong section after the case studies loaded
- What happened: a jump to Origin near the end of the insider write-up loaded the case studies, the panel grew,
  and the section nav still marked "Results" because no scroll event came.
- What we did: the nav also re-marks when the panel's content changes size (T13, `bed40e2`).
- Public: yes
