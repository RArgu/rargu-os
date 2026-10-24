# Spec 004 critique (Codex)

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -s read-only --ephemeral`
- **Model / effort:** gpt-6.1-sol / high
- **Session id:** 01a166de-ecb2-7e13-bfec-e2da24301ef9 · **Tokens:** 146,189
- **Date:** 2026-10-22 · **Commit:** c3af2d4 + uncommitted spec drafts

## Dispositions

Checked by Claude: `tracker/main.ts:596-601` (second WAV question), `writer/main.ts:445-449` (Tab trap),
`paint/main.ts:1009` (800 × 800 limit), `tracker/main.ts:1245` (demo not awaited). All accepted.

| # | Sev | Disposition | Change |
|---|---|---|---|
| 1 | High | Accepted | 002 R6 amended: every document write downloads (new, opened, bundled). R7.a. |
| 2 | High | Accepted | R7: one WAV download, no second question on the sheet. |
| 3 | Medium | Accepted | R2: client = manifest size, outer rects in sheet, T1 writes the table + mock v0.7; 002 R15 sets 16 px text. |
| 4 | Medium | Accepted | R6: Music ready only after the demo parses. |
| 5 | Medium | Accepted | R6.a: non-zero samples; retry when audio is refused. |
| 6 | Medium | Accepted | R13 + 002 R6 fallback link; three browsers. |
| 7 | Medium | Accepted | R5.a: 640 × 400 at zoom 2, away from limits; "until the scroll limit". |
| 8 | Medium | Accepted | R4, R9: existing limits kept; naming rule stated. |
| 9 | Medium | Accepted | R1: card labels vs window title prefixes with file name and marker. |
| 10 | Medium | Accepted | R10: Escape leaves the Notes editor. |
| 11 | Medium | Accepted | R3, R8 and stronger checks (pixels, notes, PCM, Help). |
| 12 | Medium | Accepted | R7: one export at a time; 10-minute limit [Prop]. |
| 13 | Low | Accepted | Approach: WRITER-EXPORT.md stays deferred. |

## Codex output (verbatim)

Revise spec 004 before approval. The main blockers are Save behavior and duplicate WAV downloads.

**Evidence:** **Observed** facts below come from read-only `nl -ba`, `rg`, and `rg --files` commands. Calculations used `python3 -c`. **Derived** states the consequences. Browser behavior remains **Unverified** where noted.

1. **High — Save does not always download.** [004 spec:33](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:33)

   **Observed:** The host downloads only writes under `/downloads/` (`002-app-host/spec.md:57`). Tracker loads the demo with its original path, then Save writes that path (`tracker/main.ts:519`, `:553`). Paint and Writer also save back to an opened file’s path (`paint/main.ts:1072`, `writer/main.ts:206`).

   **Derived:** Editing the demo and pressing Save changes the memory copy without downloading a `.trk`. Save after Open can fail the download promise in all three apps. Current acceptance checks miss these cases.

   **Spec fix:** Add: “On the sheet, Save uses a download destination. A document without one first uses Save As, including imported files and the bundled demo. Every subsequent Save downloads the current content.” Test demo → edit → Save and Open → edit → Save in each app. Define destination mapping in an explicit amendment to 002 R6.

2. **High — WAV export downloads before asking whether to download again.** [004 spec:35](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:35)

   **Observed:** Tracker obtains a `saveFile` destination, renders, and writes the WAV (`tracker/main.ts:571–591`). It then asks “Download the WAV to this device too?” and calls `downloadBytes` (`:596–601`). The host already downloads the preceding write (`002-app-host/spec.md:57`).

   **Derived:** Choosing Download produces two downloads. Choosing Not now occurs after the first download.

   **Spec fix:** Add: “On the sheet, WAV export uses the host download once and omits Tracker’s second download question. Preserve the old OS flow.” Require exactly one download after confirmation and zero after filename cancellation.

3. **Medium — The layout has no reviewable dimensions or complete acceptance check.** [004 spec:32](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:32)

   **Observed:** Manifest dimensions size the app’s client area, as shown by `wm/window.ts:179–183`. The 001 layout table records outer window dimensions (`001-sheet/spec.md:143`). Spec 004 supplies neither revised outer rectangles nor demo-area dimensions. R2.a checks only overlap (`004 spec:45`).

   **Derived:** Incorrectly sized or partly off-sheet windows can pass. The ≥470 threshold only prevents Tracker from hiding its side panel (`tracker/main.ts:1197`). It does not prove that its controls fit.

   **Spec fix:** Add a proposed table with outer rectangles and client dimensions before approval. Require client sizes equal the manifest values, outer rectangles stay inside 3000 × 1640, and controls remain reachable. Verify `--u: 1px`, computed base text size 16px, and identical app geometry on desktop and phone. The current token default is 24px (`ui/tokens.css:36`), while the binding owner row requires 16px (`OWNER_QUESTIONS.md:43`).

4. **Medium — The demo can still be loading when Music becomes usable.** [004 spec:35](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:35)

   **Observed:** Tracker starts `openDemo()` without awaiting it (`tracker/main.ts:1245–1246`). Play already operates on the initial empty song (`:84`, `:129`). Loading the demo calls `reset()`, which stops playback (`:482–484`).

   **Derived:** With a delayed resource read, the first Play can start silence and then stop. “The song name shown” also proves only a filename, since the title uses `baseOf(path)` (`:1036`).

   **Spec fix:** Add: “Music becomes ready only after the bundled demo parses successfully. Play is unavailable until then.” Name the source `system/home/guest/Music/demo.trk`. Test with its read deliberately delayed, then assert actual demo notes and tempo before Play works.

5. **Medium — The audio check permits silent playback and conflicts with the host’s retry rule.** [004 spec:51](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:51)

   **Observed:** R5.a checks only advancing position. `audioContext()` discards resume errors (`tracker/engine.ts:838–840`). The host permits a second attempt when the browser keeps audio suspended (`002-app-host/spec.md:68`).

   **Derived:** A disconnected or muted synth can pass R5.a. Conversely, “after one tap” rejects the suspended-context fallback that 002 explicitly permits.

   **Spec fix:** Replace the unconditional promise with: “One deliberate Play activation starts playback when browser audio permission allows it. Otherwise, show a usable retry.” Require advancing rows **and nonzero audio samples** in automated coverage. Add denied-resume, retry, Stop, and keyboard Play checks. Keep real audible playback as an explicit browser check.

6. **Medium — Browser download behavior is assumed across asynchronous work.** [004 spec:46](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:46)

   **Observed:** Paint awaits PNG encoding (`paint/main.ts:1042`), which uses asynchronous `canvas.toBlob` (`lib/wallpaper.ts:17–22`). Tracker awaits offline rendering (`tracker/main.ts:581`). Downloads use a programmatic Blob-link click (`lib/download.ts:35–47`).

   **Unverified:** Whether automatic downloads succeed after these steps in each supported browser, including repeated downloads.

   **Spec fix:** Require actual download events and exact download counts for PNG, WAV, TRK, and TXT in Chromium, Firefox, and WebKit. Add a visible user-activated download link when an automatic download cannot start. Define that reusable mechanism in 002 and exercise the real app flows in 004.

7. **Medium — The two-finger test cannot work with the default canvas.** [004 spec:49](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:49)

   **Observed:** Paint starts with a 320 × 200 canvas at internal zoom 1 (`paint/main.ts:145`, `:1286`). Its client area is 430 × 286. The sidebar occupies 56px before the canvas frame (`paint/styles.css:14`, `:19`). Panning changes bounded scroll offsets (`paint/main.ts:957–958`).

   **Derived:** The default canvas has no 166.67-app-pixel horizontal scroll range needed for a 100-screen-pixel movement at 60%. Even a correct fix cannot satisfy the check at a scroll boundary.

   **Spec fix:** State that movement follows fingers “until the canvas scroll limit.” Set up a 640 × 400 picture at internal zoom 2 and start away from both limits. Assert the movement at 60%, 100%, and 160%, unchanged pixels, and unchanged sheet position. Test clamping separately.

8. **Medium — Open and filename promises exceed the existing behavior.** [004 spec:33](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:33)

   **Observed:** Paint requests only `.png` and rejects images above 800 × 800 (`paint/main.ts:1078–1080`, `:1009`). Writer limits files to 1 MiB and lists specific extensions (`writer/main.ts:18–19`, `:160`). Writer preserves an opened basename in Save As (`:201`), so opening `notes.md` does not automatically yield a `.txt`.

   **Derived:** “Other image the browser reads” includes images Paint explicitly rejects. The `.txt` promise does not follow from the default name alone.

   **Spec fix:** Preserve the existing limits explicitly: “Paint opens PNG files up to 800 × 800. Notes opens its listed text formats up to 1 MiB.” Define Notes’ download naming rule for imported files, including extension replacement to `.txt` if that is the intended promise. Test invalid and oversized files without losing current work.

9. **Medium — Fixed window titles conflict with app-generated titles.** [004 spec:31](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:31)

   **Observed:** All apps replace their title with an app name, filename, and modified marker (`paint/main.ts:683`, `tracker/main.ts:1036`, `writer/main.ts:136`). The host forwards `setTitle` to the title bar (`002-app-host/spec.md:53`).

   **Derived:** Registry labels alone cannot produce the stated titles. Suppressing title updates would also remove filename and unsaved-change information.

   **Spec fix:** Define both identities: “Card labels are Paint, Music, Notes. Window titles use those prefixes and retain the filename and modified marker.” Require sheet-only prefix changes and checks after startup, editing, Open, and Save.

10. **Medium — Notes traps keyboard visitors in its editor.** [004 spec:36](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:36)

    **Observed:** Writer prevents both Tab and Shift+Tab and inserts spaces (`writer/main.ts:445–449`). Its editor has no Escape exit. R6 places the caret there upon activation. The shell requires keyboard traversal through windows (`001-sheet/spec.md:53`).

    **Derived:** After activating Notes, ordinary keyboard traversal cannot reach another window or the card.

    **Spec fix:** Add: “On the sheet, Escape from the editor focuses the Notes window region. Tab and Shift+Tab then continue shell navigation.” Test this after typing, including unchanged text. Preserve normal editor Tab behavior and the old OS behavior.

11. **Medium — Acceptance checks permit broken editing, empty menus, and missing reset behavior.** [004 spec:41](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:41)

    **Observed:** R3.a checks only non-white pixels, R5.b only a WAV header and positive length, and R7.a iterates whatever Help items exist. R9.a omits songs and settings (`004 spec:46–61`). Existing features include Paint export and editing menus (`paint/main.ts:1207`, `:1215`), Tracker instrument/pattern editing (`tracker/main.ts:1087`), and Notes Find/Replace and view settings (`writer/main.ts:395`, `:413`).

    **Derived:** A fixed PNG, a silent header-only WAV, or an empty Help menu can pass. Music edits and app settings could survive reload without failing R9.a.

    **Spec fix:** Add: “Existing features remain except the explicitly removed items.” Inventory retained menus, including Paint’s Export to Downloads. Require:
    
    - PNG pixels match the stroke at known coordinates.
    - A Music edit survives TRK download and reopen.
    - WAV contains nonzero PCM samples and the expected duration.
    - Each Help menu contains exactly one working About action, including after menu rebuilds.
    - Songs, drawings, notes, and changed settings return to defaults after reload.

    Include cancellation, dirty-document prompts, activation without lost edits, and representative editing checks under both motion preferences.

12. **Medium — WAV rendering has no bound on concurrent work or large exports.** [004 spec:35](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:35)

    **Observed:** The format permits 128 order entries, 32 rows per pattern, and 40 BPM (`tracker/engine.ts:11–14`, `:320`). Rendering allocates the full float buffer, then encoding allocates the WAV (`:1004–1031`). Export has no in-progress guard (`tracker/main.ts:571`).

    **Derived:** A valid maximum-duration song needs about **258.5 MiB** of samples plus **129.2 MiB** of WAV bytes, before other allocations. Repeated export actions can start concurrent renders.

    **Spec fix:** Add: “Only one export runs per Music window. Measure large-song export before implementation approval. Specify a supported duration limit and reject larger exports before allocation.” Add a repeated-activation check and a responsiveness threshold on a named test profile. Keep this app-specific work in 004.

13. **Low — The earlier Writer export proposal has no disposition.** [004 spec:20](/Users/rargu/DevPageOS/docs/specs/004-quick-tools/spec.md:20)

    **Observed:** `docs/spec/WRITER-EXPORT.md:18–22` proposes a separate Export action that preserves save state. It is marked proposed (`:3`) and is absent from Writer’s current menu (`writer/main.ts:348–361`). Spec 004 instead uses Save and Save As for downloads.

    **Spec fix:** Add: “For `/next`, this spec uses Save/Save As for text downloads. The separate Writer Export proposal remains deferred for the old OS.” Do not imply that Export already exists.

**Could not check:** No sheet host exists under `src/sheet/`, and mock v0.7 is absent. Actual layout, audio output, browser download policy, touch gestures, performance, and live reduced-motion behavior remain **Unverified**. I did not run build, lint, or tests. Test and browser pipelines generate files (`package.json:17`, `playwright.config.ts:16`). No files changed and no network actions ran.

## Prompt (verbatim)

You are an independent read-only reviewer for DevPageOS (the RArgu OS site). Do not modify files.

Read first: AGENTS.md; docs/specs/004-quick-tools/spec.md (the spec under review); docs/specs/001-sheet/spec.md and docs/specs/002-app-host/spec.md (the shell and the app host it depends on; both critiqued, read their critiques in docs/review/ too); docs/OWNER_QUESTIONS.md (owner decisions, binding; note the app-scale-1 row replaces an earlier phone row); src/apps/paint/, src/apps/tracker/, src/apps/writer/ (main.ts, manifest.json, styles.css), src/apps/lib/open.ts, src/apps/lib/download.ts, docs/spec/WRITER-EXPORT.md; src/sdk/os.d.ts; src/ui/dom.ts; src/ui/tokens.css.

Task: critique spec 004 before the owner approves it. Check that each requirement is right about the current code (cite path:line), testable, and that each acceptance check can fail. Look for: app behaviour the spec assumes but the code does not have (or the reverse); menu items, resources, settings or saved state the spec forgets; conflicts with 001/002 or the owner decisions; layout and size claims at scale 1 (--u = 1px); audio and download rules in browsers; performance; reduced motion; work that belongs in another spec.

Constraints: No network actions, no deploys, no file changes. Owner decisions in docs/OWNER_QUESTIONS.md are binding; flag a conflict rather than override one.

Answer format: findings ordered by severity (High/Medium/Low), each with path:line, the evidence, and a concrete fix to the spec text. Keep observed facts apart from inference. End with what you could not check.
