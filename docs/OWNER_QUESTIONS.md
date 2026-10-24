# Owner questions

Decisions the owner made outside a spec. Newest last. A spec that goes against a row here must ask again first.

## Open

- None.

## Answered

| Date | Question | Answer |
|---|---|---|
| 2026-10-22 | Product name | **RArgu OS** (GitHub handle spelling). |
| 2026-10-22 | Why redesign | DevPageOS is slow (kernel boot and filesystem mount before the first command answers) and hard for a recruiter to use. The portfolio must be visible at once. |
| 2026-10-22 | How much OS look | Retro window frames around live demos only. No desktop, taskbar or "open an app" step. |
| 2026-10-22 | Inspiration | voquill.com (live views that explain each product), taniarascia.com (fixed identity panel, warm retro look), trycardinal.com (draggable tiles). |
| 2026-10-22 | Project order | CastleSiege, Castle Wars (WIP), Pentimento (WIP), Focused Web Crawler, Insider Trading on Polymarket. |
| 2026-10-22 | Castle Wars | Show as work in progress: the real sprite sheets, animated. |
| 2026-10-22 | Crawler and Polymarket demos | Click-through demos. Dummy data for now. Later (separate work): run the Polymarket check on any market by ID, and run the crawler for real with a visitor-chosen cheap model and a downloadable result. |
| 2026-10-22 | Look | Approved: Pixel Operator, the 16-colour palette, cream sheet with grid, plum title bars, hard shadows. |
| 2026-10-22 | Window drag | The grabbed point follows the pointer exactly. A throw flies a short, computed distance (x(t) = x0 + v·τ·(1 − e^(−t/τ)), τ = 0.12 s, cut at 2τ, 360 px max), stops dead as if pinned, then wobbles about the grab point. |
| 2026-10-22 | Wobble | Must stop quickly. Kick passes through a log (4°·ln(1 + τ/150)); damping ζ = 0.34 at 2.6 Hz; settles in under 1 s. |
| 2026-10-22 | Layout | Not a vertical page. One large blueprint sheet that pans in every direction. Projects sit in a loose grid (3 × 2); any window can go anywhere. |
| 2026-10-22 | Layout per visitor | The same for every visitor. Do not save a visitor's arrangement. |
| 2026-10-22 | Overlay card | Name, role, one line, Resume/GitHub/LinkedIn, email with copy, project list (pans to each), Quick tools icons, **Reset page** button. |
| 2026-10-22 | Quick tools | Renamed from "The desk". Paint, Music, Notes (saves .txt). Icons on the overlay **take the view to the tool** (never bring the tool to the view). |
| 2026-10-22 | Terminal | Removed completely. |
| 2026-10-22 | Zoom and minimap | Zoom by pinch, ⌘/Ctrl-scroll and − / + / fit buttons. Minimap at bottom right. |
| 2026-10-22 | Sheet labels | No "Fig." labels on the sheet. The windows carry their own information. |
| 2026-10-22 | Repo hygiene | `.claude/` local files and `art-source/` (754 MB) stay out of git. Skills come from RETVController. |
| 2026-10-22 | Session split | This session: specs. Next session: the build, from a handoff. |
| 2026-10-22 | How to split the redesign into specs | Seven specs: 001 sheet, 002 app host (OS API stand-in, lazy load), 003 CastleSiege live, 004 Quick tools, 005 WIP windows (Castle Wars, Pentimento), 006 data demos (dummy data), 007 switch-over and deploy. |
| 2026-10-22 | Where the sheet lives during specs 001–006 | A second entry page in the same Vite build. The old OS stays at `/` until spec 007 swaps them. |
| 2026-10-22 | Phone first view | On narrow screens the sheet opens zoomed so the first window fits the screen width. Same layout as desktop; pinch to zoom in. |
| 2026-10-22 | Spec critic | Codex, as in RETVController: ChatGPT.app CLI, gpt-6.1-sol, read-only, high effort. |
| 2026-10-22 | Body font | Self-host Instrument Sans (SIL OFL) in public/fonts, copied from the @fontsource/instrument-sans dev dependency. No call to Google Fonts. |
| 2026-10-22 | Whole-Plant Ice Cream on the sheet | No. Five project windows only. It stays in the resume. |
| 2026-10-22 | Music window | The real Tracker through the app host, with a short demo song loaded so Play works at once. Not the mock drum grid. |
| 2026-10-22 | CastleSiege first view | A game ready against the bot (visitor is White), with the controls and move history at the side, as in today's CastleSiege app on rargu.dev. Top menu: bot level, bot style, switch to hot-seat (local two-player). |
| 2026-10-22 | Low-contrast mock colours (Codex 001 #16) | Fix the weak pairs: dark-theme title text dark (#111a33 on pink, 6.93:1); status badges ink text with the hue on the border; light-theme focus ring navy. Mock gets a v0.6 copy. |
| 2026-10-22 | Skills in this repo after agent-skills (c79ad0f) was installed | Leave as is: keep `.agents/skills` copies, no workflow profile section in AGENTS.md. The general user-level skills (which win on name clash) run on their defaults, which are this repo's values. |
| 2026-10-22 | CastleSiege window size on phones (**replaced** by the app-scale row below) | Desktop: wide window (~920 sheet px) with the side panel. Screens ≤ 760 px: narrow layout (~600 px, board full width, Moves/Pieces as buttons below), so the phone opens at ~60%. |
| 2026-10-22 | App scale on the sheet | Scale 1 everywhere: `--u` = 1 px, 16 px app text, 1 app px = 1 sheet px. CastleSiege keeps its side panel in a ~620 px window on every screen; no phone-only layout. |
| 2026-10-22 | Crawler and Insider demo style | As in the mock (artifact v5 / mock v0.6): dummy demos. Crawler: four strategy columns stream simulated pages with precision per column, pause button. Insider: invented market chart draws itself, spike, flagged wallets list, replay button. Both labeled simulated. |
| 2026-10-22 | Old DevPageOS code at switch-over (007) | Delete from main: old entry page and code only it uses, with their tests. Tag the last commit with it `devpageos-final` (pushing the tag is G-push). |
| 2026-10-22 | Renames in 007 | Site text, link previews, README and package name (`rargu-os`). The GitHub repo rename is done by the owner; then `repoUrl` and the local remote are updated. The Cloudflare Worker name stays. |
| 2026-10-22 | Add `@fontsource/instrument-sans` as a dev dependency (001 T2)? | Yes. Installed 5.3.0 (OFL-1.1). Only the copied woff2 files and the license in `public/fonts/` are served. |
| 2026-10-22 | `content/projects/castlewars.md` also appears in the old OS Projects folder (`scripts/build-image.ts` reads every file). Allowed under 001 R1? | Yes, let it show in the old OS. No old-OS code changes for it. |
| 2026-10-23 | Overnight run (this session only): what to do when a task needs a change to an approved requirement, a new dependency or an "Ask first" item? | A Fable advisor agent makes the call for the owner. Each decision is logged in the ledger and the morning report. The build-session rules still hold: no deploy, no push, nothing in `art-source/`. |
| 2026-10-23 | How to show the 001 T8 pairs page overnight? | As a private claude.ai artifact. The link goes in the morning report. |
| 2026-10-23 | 8 old-OS `ui-containment` e2e tests already fail in Firefox and WebKit on `build/v1.1`. What counts for 001 T9 (`e2e:all`)? | Fix them too. The owner approves that old-OS change. |
| 2026-10-23 | After 001 is Verified (local)? | Continue the build order: 005, 006, 002, 003, 004, with the built-in stops (the 004 T1 mock v0.7 review stops 004). 007 is not started. |
| 2026-10-23 | 001 T6: at the R15 phone fit (58 %) CastleSiege's title bar is under the folded card bar. Fix? (**decided by the Fable advisor for the owner**, overnight run) | Option A: on ≤ 760 px a top inset above the sheet, equal to the bar's height + 16 px. Layout table, sheet size, desktop and the phone fit unchanged. Owner to confirm. |
| 2026-10-23 | 001 T7: on desktop a window moved to the sheet's left edge stays under the card (R19). Fix? (**decided by the Fable advisor for the owner**, overnight run) | Option A, as on phones: a left inset (card's right edge + 24 px) and a 24 px top inset; start view and Reset scroll past them so the first screen is unchanged. Owner to confirm. |
| 2026-10-23 | 005 T5: the mock grows Pentimento to 635 px after a run; the layout table fixed it at 542 px, so only ~1.5 of five command lines showed. Fix? (**decided by the Fable advisor for the owner**, overnight run) | Option C: fixed 635 px window (demo 404) so all five lines fit; 001 layout table updated; 005 R9 amended (allowed difference before a run). Mock not changed. Owner to confirm, and to decide on a mock v0.7. |
| 2026-10-23 | 006 T3/T4: the real project text makes the crawler and insider windows too short for the mock's inner sizes. Fix? (**lead decision**, following the 005 advisor precedent, overnight run) | Grow the windows: crawler h 522 (was 496), insider h 551 (was 511); demos keep the mock's inner sizes. 001 layout table updated. Owner to confirm. |
| 2026-10-23 | 002 T5: the shared `src/ui/menu.ts` placed popups wrong on the zoomed sheet; fixing it touches shared UI outside 002's "only `dom.ts`" boundary. Allow? (**decided by the Fable advisor for the owner**, overnight run) | Option A: keep the fix (old-OS positions unchanged by construction); 002 Always boundary amended; a unit test for an offset, zoomed root is required (added with the T5 review fixes). Owner to confirm. |
| 2026-10-23 | 004 R10 vs 002 T5: in Notes, does Escape alone leave the editor, or Escape then Tab (the 002 host's general route)? | **Owner:** Escape alone moves focus out of Notes (as 004 R10 says). The host's Esc-then-Tab route stays for the other apps. |
| 2026-10-23 | 003 T2/T3: R3 says the phone fit is "about 63 %" but 001's rule gives 57.7 %; R4 removes Exit, so R1.b "closed and started again" has no close path. (**decided by the Fable advisor for the owner**, overnight run) | R3 amended to "about 58 %" (wording only). R4 kept; R1.b amended: "started again" = page reload, plus no autosave file and empty browser storage. Owner to confirm. |
| 2026-10-24 | Mock v0.7 (004 T1, Quick tools sizes and CastleSiege height) | **Approved.** (The build uses CastleSiege 654 px after 003 T8; v0.7 shows 658.) |
| 2026-10-24 | The overnight advisor and lead decisions (morning report) | **Confirmed.** |
| 2026-10-24 | Budget at 98.2 of 100 KiB; 004 may exceed it | **Raised.** Performance comes before size: responsiveness first, size second. Lead set the 001 R22 limit to 150 KiB gzip (the guard still fails above it); R8/R22 responsiveness checks stay strict. |
| 2026-10-24 | CastleSiege rules text describes the old OS | **Remove the rules from the sheet** (How to play and Rules items and panel); revise later. |
| 2026-10-24 | Long project titles wrap in the card | **Shorten them** so they do not wrap. |
| 2026-10-24 | 680 px windows wider than a 390 px phone | **Ignore for now**; assume landscape on phones. |
| 2026-10-24 | No close button on sheet windows | **OK for now.** |
| 2026-10-24 | 004 T5: the spec's 10-minute WAV export limit vs the host's 8 MiB file limit (~94 s) and ~2-minute renders | **Owner:** cap WAV export at 90 s on the sheet (refused before rendering with a message). |
| 2026-10-24 | Spec 008 (old-OS CastleSiege fixes), incl. R4: songs follow Music, Sound controls effects only | **Approved** ("approve 008"). |
| 2026-10-24 | 007 T1 Ask-first: extra deletes (`report/shots/`, old `tools/eye*` and Firefox smoke scripts, `design/mockups/`) | **Owner:** delete all three. |
| 2026-10-24 | 007 T1: old-OS-only code paths left in the four kept apps | **Owner:** cut them in 007 (with the `system/` files only they use). |
| 2026-10-24 | 007 T1: the 008 old-OS CastleSiege tests | **Owner:** retire; port only the shared-code (`src/ui/menu.ts`) tests to the sheet. |
| 2026-10-24 | 007 T1: old-OS docs (`docs/spec/SPEC.md`, plans) | **Owner:** move to `docs/archive/`. |
| 2026-10-24 | 007 T3: old generated filesystem image (`public/system.img.json`, `public/img/`, untracked) would ship in `dist/` | **Owner:** delete it with its `.gitignore` lines (T5). |
| 2026-10-24 | Wobble and held drag (owner after the 007 T11 preview: drags look "janky, like motion blur"; "make the wobble less aggressive (ask Fable how)") | **Fable advisor decision, built in spec 009 T1; owner to confirm.** A held window only translates (no lean, no lift scale; the lifted shadow stays). Kick 2.5°·ln(1 + τ/150) (was 4°); damping ζ = 0.45 at 2.6 Hz (was 0.34); settles from 0.8 s after the pin. A window has `will-change: transform` only while it moves. Replaces the numbers of the 2026-10-22 "Wobble" row. |
| 2026-10-24 | Morning report decisions (spec 009) | **Owner:** held tilt back (spec 010 R1: the pre-009 lean, ζ = 0.65, up to ±12°, no lift scale); landing wobble kept for now ("revisit later, mocking in Blender first"); music hint removed, 404, phone mark, 009 scope and the per-motion layer hint confirmed. |
| 2026-10-24 | 404 tip line | **Owner:** remove "The numbers come off the sheet…" (spec 010 R2; the key hint stays hidden for screen readers). |
| 2026-10-24 | GitHub repo | **Owner:** a public repo `RArgu/rargu-os` with a fresh history of the site files only; `design/`, `plan/`, `tools/`, `docs/archive/`, `docs/handoffs/` stay local (spec 010 R4). G-push given for it. |
| 2026-10-24 | Merge into `main` | **Owner:** fast-forward (spec 010 R6). |
| 2026-10-24 | Deploy (007 T12) | **Owner:** "G-deploy OK", for the commit that passes all checks (spec 010 R5). |
