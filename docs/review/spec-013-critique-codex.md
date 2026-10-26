# Spec 013 critique (Codex)

- CLI: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config`, read-only, ephemeral
- Model: gpt-6.1-sol, reasoning effort high
- Session id: 01a17987-63e3-7321-b36f-fe6e2a82b4cc · tokens used: 119,520
- Date: 2026-10-26 · Spec: `docs/specs/013-project-readme-window/spec.md` (Draft, untracked) at HEAD `9b9f520`

## Dispositions

Checked by the 013 lead on 2026-10-26 against the files named. "Cross-spec" means the change belongs in 011 or 012.
The 013 lead does not edit those folders. The requests go to the orchestrator. No owner decision was changed.

| # | Severity | Disposition | Why |
|---|---|---|---|
| 1 | High | Accepted (partly NEEDS OWNER) | True: Googlebot runs JavaScript, so an address inserted after load can be indexed. `noindex` on the JSON does not cover the page that shows it. R18 now states the real protection (no address in the first HTML), adds `data-nosnippet`, and tests the rendered page. Load on a reader's press instead of on scroll is N9 (the owner said "when Origin opens"). |
| 2 | High | Accepted (013 part); cross-spec for 012 | The 013 copy is a static JSON in the build. Removal needs an edit and a deploy (G-deploy), so it is not "at once". New R19: removal steps, short cache on the JSON, and honest wording ("within 7 days", copies already downloaded cannot be recalled). 012's bundled fallback, result JSON and one-year picture cache go to 012. |
| 3 | High | Cross-spec (011) | Crawler fetch rules are 011 R8. Nothing in 013 fetches. |
| 4 | Medium | Cross-spec (011, 012) | Free-plan limits, D1 query count and push size belong to the tools. 013's only tie is the ship rule (R17), which is unchanged. |
| 5 | Medium | Cross-spec (011, 012) | Shared Worker, D1 vs `Limits` Durable Object, counting before outbound calls. |
| 6 | Medium | Cross-spec (011, 012) | Nightly lock and timezone. |
| 7 | Medium | Accepted | True: `src/sheet/main.ts` needs `#vp`, `#world`, the card and all windows. `vite.config.ts:55` has `base: "./"`, so `./assets/…` breaks under `/p/crawler/`. R12 now says each `/p/<id>/` page is the built sheet page with its own head and an open-on-load marker, with absolute asset URLs, checked by the sheet guard. |
| 8 | Medium | Accepted | New transition table (R20) for direct entry, Read, Expand, Restore, other tabs, Back, Forward, with focus fallbacks. Desktop Restore keeps `/p/<id>/` while Read stays open. |
| 9 | Medium | Accepted | True: `.sheet-win` has a fixed height and `overflow: clip` (`src/sheet/sheet.css:192`). Without JavaScript, `/` now shows a link to `/p/<id>/` in the window. `/p/<id>/` shows the write-up as a full page (CSS only). The test checks every section is visible. |
| 10 | Medium | Accepted | True: `renderMarkdown` makes `sec-<slug>` ids per document (`src/apps/resume/doc.ts:96-103`). Ids are now prefixed with the window id. |
| 11 | Medium | Accepted | True: Topic, Visitor, Queue, Push and Stored boxes are not stage ids. Boxes now have their own `id` and an optional `stage`. Schema defined in R9. |
| 12 | Medium | Accepted (013 part); cross-spec for 011, 012 | 013 now defines the payloads, keeps the last event on the window node, clears on `done`/`null`, and shows one active box (the latest). 012's stored-result draw is labelled "drawing", not "running". Emission of `tool:status` and an end event go to 011/012. |
| 13 | Medium | Accepted | True: `src/sheet/host/window.ts:316` stops every keydown in a hosted app, so a bubbling Esc handler never sees it in expanded CastleSiege. R4 now defines the full tab pattern, initial focus, the direct-entry focus fallback, and Esc ownership (hosted apps keep the 002 Esc then Tab rule). |
| 14 | Medium | Accepted | True: `#vp` has `touch-action: none` (`src/sheet/sheet.css:124`), and its keydown handler pans on arrows (`src/sheet/view.ts:406-412`). R3 now gives the Read panel `touch-action: pan-y`, adds it to the no-pan list, and keeps arrow, Page and Space keys in the panel. |
| 15 | Medium | Accepted | True: `src/sheet/demos/visibility.ts:87` uses geometry and `document.hidden` only. R6 now defines visible = tab visible and (expanded or in view) and the panel shown. Hidden animation stops; a Try run is not cancelled by a mode change. |
| 16 | Medium | Accepted | True: `scripts/sheet-guard.ts:82` has `SHELL_KIB = 100` beside the 150 KiB budget. Acceptance added for FLIP, mid-animation preference change, contrast, network allowlist and idle frames. R15 names both budgets. |
| 17 | Medium | Accepted (013 part); NEEDS OWNER for the rule's exact test | True: 012 R22 checks the report's section 4 wallets over 5 resolved markets. 013 had "2 resolved markets". 013 now uses 012 R22's output with full addresses. What "flags the report's wallets" means when only some are flagged is N10. Published rows are labelled "selected case checks". |

## Codex output (verbatim)

Spec 013 needs revision before approval. The findings below preserve the owner’s decisions.

**Observed** evidence comes from local `nl -ba`, `rg`, and `git status --short` reads. **Derived** statements describe consequences of those requirements and code.

1. **High — The noindex check does not prove the claimed privacy protection.**  
   **Observed:** [013/spec.md:113](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:113) puts `noindex` on the JSON, then inserts its contents into HTML pages. [013/spec.md:210](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:210) presents this as protection against wallet indexing.  
   **Derived:** R18.b proves that source HTML omits addresses. It does not prove that search engines cannot index the rendered page after JavaScript loads them. The same gap affects 012’s API results.  
   **Fix:** Keep the owner’s JSON design, but state its actual protection: addresses stay out of initial HTML. If rendered-page exclusion remains a requirement, specify the HTML indexing policy and test it separately.

2. **High — The removal promise does not cover every published copy.**  
   **Observed:** [013/spec.md:113](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:113) offers correction or removal. However, 012’s block list controls later pushes, its fallback is bundled separately, and pictures receive one-year immutable caching ([012/spec.md:50](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:50), lines 54 and 57).  
   **Derived:** Blocking a wallet can leave its report case study, bundled result, existing result JSON, and cached picture available. “At once” removal is not supported by this design.  
   **Fix:** Define one removal procedure covering those copies. Specify cache invalidation and refresh behavior, including frozen markets. Test removal after a visitor has already loaded the result and picture. State that previously downloaded copies cannot be recalled.

3. **High — Signed crawler links do not complete the destination checks.**  
   **Observed:** [011/spec.md:54](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:54) rejects IP literals and several hostname forms. It signs links found on fetched pages. It does not require public-address validation for DNS results or specify equivalent redirect checks for robots.txt.  
   **Inferred risk:** An attacker-controlled seed page can contain a signable hostname that resolves to a private address. Whether the Worker runtime blocks every such connection is unverified locally.  
   **Fix:** Require verified public-destination enforcement for page and robots requests, including redirects and DNS changes. Add cases for private-address aliases, redirect chains, credentials in URLs, and forged tags. Keep the owner’s signed-link approach.

4. **Medium — Free-plan feasibility lacks complete pass rules.**  
   **Observed:** [013/spec.md:112](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:112) couples publication to the live tools. Local research leaves crawler link signing and a 1 MB insider push unmeasured. It also states a 50-query D1 limit per invocation ([012/research.md:164](/Users/rargu/DevPageOS/docs/specs/012-insider-live/research.md:164)). A market can contain 100 candidate slots and corresponding pictures.  
   **Derived:** Separate picture writes can exceed that query limit. Unbounded chart history can exceed the push envelope. The label estimate also assumes approximately 500 input tokens and three output tokens.  
   **Fix:** Define maximum chart points, links, pictures, serialized bytes, and model output tokens. Specify batching and atomic publication. Make measured CPU, subrequests, D1 queries, and neuron consumption release checks. KV is unused, so its quota should not enter the fit claim.

5. **Medium — The shared backend has no single ownership and abuse contract.**  
   **Observed:** [012/spec.md:92](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:92) calls D1 shared with 011, but 011 specifies `Limits` in a Durable Object. The insider counter may use either. Its request rules do not say whether rejected inputs and event-resolution calls consume the daily allowance.  
   **Derived:** The tracks can implement different counters. Repeated invalid requests can still trigger Gamma calls if counting occurs only after validation.  
   **Fix:** Name the owner of Worker configuration, bindings, migrations, and shared limits. Choose D1 or `Limits` now. Count attempted requests before outbound calls, use atomic reservations, and specify body limits, token validation, and bounded retries. Test concurrent requests and exhausted quotas across both tools.

6. **Medium — The nightly lock cannot recover from every failure described.**  
   **Observed:** [011/spec.md:65](/Users/rargu/DevPageOS/docs/specs/011-crawler-live/spec.md:65) and [012/spec.md:58](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:58) rely on a lock file and `finally`/`trap`. They require deletion by 05:00, but also permit work to stop accepting new tasks at 04:50.  
   **Derived:** Process termination or power loss can leave a stale lock. Slow existing work can continue after a clock-based lock deletion, allowing Ollama and the job to overlap.  
   **Fix:** Define stale-lock recovery, exclusive job ownership, bounded network timeouts, and an enforced process deadline. Release the lock only after the job ends. Pin one IANA timezone across Worker and Mac configuration. Test stale locks, duplicate launches, forced termination, and late wake.

7. **Medium — The `/p/` build approach omits the sheet bootstrap and asset paths.**  
   **Observed:** [013/spec.md:234](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:234) proposes a page generator like the standalone resume generator. However, sheet startup requires `#vp`, `#world`, card controls, and every layout window. Vite also uses `base: "./"` ([vite.config.ts:55](/Users/rargu/DevPageOS/vite.config.ts:55)).  
   **Derived:** A standalone write-up cannot start the existing sheet. Copying its built asset references unchanged beneath `/p/crawler/` can resolve them under the wrong directory.  
   **Fix:** Specify the complete generated document and how it becomes the sheet without duplicate content. Use verified asset URLs. Test direct navigation, reload, and failed JavaScript against local Wrangler.

8. **Medium — History and Restore have conflicting states.**  
   **Observed:** [013/spec.md:107](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:107) says Back leaves Read, while desktop Restore can leave Read open in its original window. Direct `/p/` entry has no previous mode or expanding control. Forward behavior is unspecified.  
   **Derived:** The URL, mode, expansion, and focus can disagree after Restore, Back, or Forward.  
   **Fix:** Define a transition table for direct entry, Read, Expand, Restore, mode changes, Back, and Forward. Include the previous mode, focus fallback, scroll restoration, and whether desktop Restore retains `/p/<id>/`.

9. **Medium — The no-JavaScript acceptance check can pass with unreadable text.**  
   **Observed:** [013/spec.md:108](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:108) requires readable write-ups on `/`. R13.a checks only that headings and box names exist. Existing windows have fixed heights and `overflow: clip` ([src/sheet/sheet.css:182](/Users/rargu/DevPageOS/src/sheet/sheet.css:182)).  
   **Derived:** Both checks can pass while the lower sections remain clipped or hidden.  
   **Fix:** Specify the no-JavaScript layout, including overrides for panel hiding and fixed heights. Test that every section is visible and reachable by scrolling at both viewport sizes.

10. **Medium — Reusing the renderer creates duplicate heading IDs.**  
    **Observed:** [013/spec.md:224](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:224) reuses `renderMarkdown`. Its ID set resets per document, producing `sec-overview`, `sec-results`, and similar IDs ([src/apps/resume/doc.ts:82](/Users/rargu/DevPageOS/src/apps/resume/doc.ts:82)). Both write-ups share those headings.  
    **Derived:** The sheet gets duplicate IDs. Fragment navigation and accessibility references can target the other project.  
    **Fix:** Prefix rendered IDs with the project ID. Test uniqueness across the complete sheet and navigation within each write-up.

11. **Medium — The diagram validation rejects the planned system diagrams.**  
    **Observed:** [013/spec.md:112](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:112) requires box IDs to equal tool stage IDs. The outlines also include Topic, Visitor, Queue, Push, and Stored results boxes ([writeup-outlines.md:129](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/writeup-outlines.md:129)). Those are not stage IDs.  
    **Derived:** Implementers must omit system components or weaken the validator.  
    **Fix:** Give every box a unique ID and an optional validated `stageId`. Define the JSON schema, arrow references, and required stage coverage.

12. **Medium — The event contract cannot yet support R10 and R11.**  
    **Observed:** [013/spec.md:268](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:268) requires `tool:status`, but neither sibling specifies its emission. Crawler events include `start/done/error`; insider events lack that state and an explicit final clear. Crawler status also has a real `busy` condition absent from 013’s union.  
    **Derived:** A completed stored result can remain marked “running.” Status can disappear when Read opens after the relevant event. Concurrent crawler events have no defined highlight rule.  
    **Fix:** Share typed event payloads, including `busy`, timestamps, completion, and replay behavior. Retain the latest state on the window. Define simultaneous-stage handling and distinguish stored-result presentation from live computation. Test real producers, not only fake events.

13. **Medium — Tab and modal keyboard behavior is incomplete.**  
    **Observed:** [013/spec.md:96](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:96) specifies a tablist and `aria-selected`, but omits tab roles, panel relationships, and keyboard navigation. R4 lacks initial focus and a direct-entry focus fallback. Existing hosted apps stop Escape propagation even when they do not prevent its default action ([src/sheet/host/window.ts:310](/Users/rargu/DevPageOS/src/sheet/host/window.ts:310)).  
    **Derived:** A bubbling dialog handler can miss Escape in expanded CastleSiege.  
    **Fix:** Define the complete tab pattern and modal focus sequence. Reconcile Escape ownership in every mode. Test Shift+Tab, initial focus, direct entry, nested menus, and expanded CastleSiege.

14. **Medium — `overscroll-behavior` does not resolve the existing input handlers.**  
    **Observed:** [013/spec.md:98](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:98) relies on containment. However, `#vp` has `touch-action: none`, Read is absent from the touch-pan exclusions, and unhandled arrow keys pan the sheet ([src/sheet/view.ts:322](/Users/rargu/DevPageOS/src/sheet/view.ts:322), line 406).  
    **Derived:** Touch scrolling in an unexpanded Read panel can start a sheet gesture. Keyboard scrolling can move the sheet.  
    **Fix:** Specify input ownership for Read, including the ancestor touch policy. Test touch and keyboard scrolling at panel boundaries, alongside wheel scrolling.

15. **Medium — Visibility rules ignore hidden modes and the browser tab.**  
    **Observed:** [013/spec.md:101](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:101) makes the expanded window visible. Existing visibility combines geometry with `document.hidden`; it does not inspect the selected mode ([src/sheet/demos/visibility.ts:87](/Users/rargu/DevPageOS/src/sheet/demos/visibility.ts:87)).  
    **Derived:** A hidden Demo panel can continue streaming beneath Read. A literal expanded-window override can also bypass browser-tab suspension. Mode changes have no explicit run-preservation rule.  
    **Fix:** Define visibility as document visibility, expansion/geometry, and panel selection. Separate animation suspension from active crawl cancellation. Test mode switches and hidden browser tabs without restarting tool state.

16. **Medium — Verification does not cover several required behaviors or the full budget.**  
    **Observed:** [013/spec.md:115](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:115) lacks explicit acceptance cases for normal FLIP motion, mid-animation preference changes, R14 contrast, and R16 network behavior. The build guard also enforces a separate 100 KiB initial-shell limit ([scripts/sheet-guard.ts:76](/Users/rargu/DevPageOS/scripts/sheet-guard.ts:76)). R15 mentions only 150 KiB.  
    **Derived:** An implementation can satisfy the listed checks while breaking required motion, network, or startup behavior. Post-build `/p/` generation may escape existing HTML checks.  
    **Fix:** Add those acceptance cases. Preserve both budgets, scan generated pages, and test idle callbacks after repeated Expand/Restore. Extend the exact 010 R9 allowlist through Try, Read, and direct `/p/` navigation.

17. **Medium — The report comparison has two different evaluation scopes.**  
    **Observed:** [013/spec.md:169](/Users/rargu/DevPageOS/docs/specs/013-project-readme-window/spec.md:169) describes a check on two newly resolved markets. [012/spec.md:59](/Users/rargu/DevPageOS/docs/specs/012-insider-live/spec.md:59) evaluates five resolved start markets and identifies some wallets by truncated address or username.  
    **Derived:** The tracks can publish different tables under the same result description. Ambiguous identity matches can change whether the owner’s publication condition passes.  
    **Fix:** Define one evaluation manifest with full addresses, market IDs, expected classifications, and the publication predicate. Preserve both outcome files privately. Keep the owner’s conditional publication rule, but label any published comparison as selected case checks.

**Could not check:** Current Cloudflare limits, product terms, indexing behavior, Polymarket permissions, report wording, or upstream repository evidence. No network actions were taken. Mac CPU, memory, lock recovery, Worker CPU, quotas, and browser behavior remain unmeasured. I did not run build, lint, tests, or e2e because this was a read-only draft review. No files were modified.