# Spec 002 T2: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a168ed-6b83-7d91-938b-0ee16743d996 · **Tokens:** 113,788
- **Date:** 2026-10-23 · **Scope:** uncommitted T2 files (the version rewritten to import nothing from
  `src/fs`/`src/apps`), against `dff7853`
- **Prompt:** below the output.

Before this review, the lead found that the first T2 version imported `src/fs/*` and `src/apps/lib/download.ts`,
which 001 R2.b forbids in `/next`; the subagent rewrote it with a standalone `memfs.ts` and a build-time virtual
module, and a new guard fixture failed on the old version (observed by the subagent: 1 failed, 14 passed).

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Oversized imports are read into memory before the size check; import errors escape the apps (R6) | Accepted. Size check first; the host reports the error and returns null. |
| 2 | User activation does not prove a download started (R6) | Accepted. A "Download <name>" link is also offered after every automatic attempt. |
| 3 | Concurrent writes can download the later bytes twice (R6) | Accepted. Snapshot inside the write. |
| 4 | Picker cancel fallback depends on `oncancel` presence; timers not cleared | Accepted. |

## Codex output (verbatim)

I found three Medium issues and one Low issue. No High findings.

**Observed** evidence comes from `nl -ba`, `rg -n`, and `git diff HEAD -- …`. No tests were run.

1. **Medium — Oversized imports allocate memory before the size check.** [src/sheet/host/fs.ts:179](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:179), [memfs.ts:182](/Users/rargu/DevPageOS/src/sheet/host/memfs.ts:182)

   **Observed:**
   ```ts
   await vfs.writeFile(path, new Uint8Array(await file.arrayBuffer()));
   ```
   The filesystem then executes `data.slice()` before checking:
   ```ts
   if (bytes.length > MAX_FILE) throw new FsError("EFBIG", p);
   ```

   **Derived:** Selecting a 1 GiB file allocates its contents and attempts another full copy before enforcing the 8 MiB limit. This defeats the memory guard.

   Import errors also escape the unchanged apps’ error handling. Writer awaits `openFile()` outside its `load()` catch ([writer/main.ts:213](/Users/rargu/DevPageOS/src/apps/writer/main.ts:213)). Paint follows the same pattern. An oversized import therefore rejects without their normal error dialog. This breaks the Open flow required by R6.

   **Fix:** Check `file.size` before `arrayBuffer()`. Check projected byte lengths before copying or merging filesystem buffers. Handle import failures in the host, show an error, and return `null`. Add tests for oversized imports and full-quota failures.

2. **Medium — User activation does not establish that a download started.** [src/sheet/host/fs.ts:45](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:45), [fs.ts:147](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:147)

   **Observed:**
   ```ts
   return !("userActivation" in navigator) || navigator.userActivation.isActive;
   ```
   ```ts
   if (canAutoDownload()) start();
   else deps.onDownloadBlocked({ name, start });
   ```
   `start()` calls `a.click()` and receives no download acknowledgment.

   **Derived:** With activation present, the code never offers recovery if the browser refuses the automatic download. R6 requires a link when the download does not start.

   **Inferred browser risk:** Browser download policy can reject an attempt despite active user activation. I did not reproduce this in a browser. The hook test only forces the alternative branch before an attempt.

   **Fix:** Keep an explicit download link available after automatic attempts. Do not treat `isActive` or successful `click()` execution as confirmation. Add a unit case where activation is true but the automatic attempt produces no download.

3. **Medium — Concurrent writes can download the later contents twice.** [src/sheet/host/fs.ts:156](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:156)

   **Observed:**
   ```ts
   await vfs.writeFile(abs, data, o);
   if (isDocumentPath(abs))
     offer((await vfs.readFile(abs)).slice(), basename(abs));
   ```

   **Derived:** Two concurrent writes of `"A"` and `"B"` to the same path can both download `"B"`. Both memory writes occur before the first wrapper resumes and reads the file.

   The memory filesystem is shared across apps. R6 requires every document write to download its resulting bytes. Reading the current file afterward loses that association. Existing download tests await each write sequentially ([host-fs.test.ts:100](/Users/rargu/DevPageOS/tests/unit/host-fs.test.ts:100)).

   **Fix:** Capture the resulting bytes within the memory write, before yielding. Use that snapshot for the download. Test concurrent writes and appends to one document path.

4. **Low — The picker’s cancellation check can disable its own fallback.** [src/sheet/host/fs.ts:114](/Users/rargu/DevPageOS/src/sheet/host/fs.ts:114)

   **Observed:**
   ```ts
   if (!("oncancel" in input)) window.addEventListener("focus", onFocus);
   ```
   `oncancel` is a global element event handler, including dialog cancellation. Its presence does not establish that file-picker cancellation emits that event. The local DOM declarations confirm this distinction.

   The fallback also schedules `done(null)` after one second without checking `input.files`. Repeated focus events replace the timer ID without clearing the previous timer.

   **Derived:** The feature check cannot reliably select the compatibility fallback required for R6 cancellation.

   **Inferred:** A browser exposing `oncancel` without file-input cancellation support leaves the promise pending. Delayed selection processing can also lose to the timeout. Affected browser versions remain **Unverified**.

   **Fix:** Install the focus fallback independently of that property check. Make settlement idempotent, clear previous timers, and inspect selected files before returning `null`. Test focus cancellation and focus-before-change. Current picker tests dispatch `cancel` and `change` directly ([host-fs.test.ts:226](/Users/rargu/DevPageOS/tests/unit/host-fs.test.ts:226)).

Other checks:

- **Observed:** The inspected app calls match the old filesystem’s path resolution, error codes, stat fields, sorting, recursive mkdir, string encoding, byte writes, append, and existence behavior.
- **Observed:** Document classification uses normalized paths and directory boundaries. Failed memory writes stop before download creation. Blob URLs have a scheduled ten-second revoke.
- **Derived:** Save-name handling prevents POSIX path traversal and rejects empty, `.` and `..` names. Extension insertion matches the old dialog. Backslashes remain literal filesystem characters.
- **Observed:** The table contains 64 resources, including 57 PNGs totaling 11,878 bytes. A read-only Python reconstruction measured about 5.0 KiB gzip. Manifest files enter as virtual-module data, without imports from `src/apps/`.
- **Observed:** T2 contains no browser-storage, IndexedDB, or network calls. The inspected old filesystem and app files have no diff.
- **Derived:** Visitors can set `__hostBlockDownloads` through DevTools. Its effect is limited to forcing the fallback. I found no security issue from that hook.
- **Observed:** Most unit checks assert filesystem state or downloaded bytes. Real-app browser checks belong to T8. Revocation and the focus fallback currently lack assertions.

**Not checked:** Tests, lint, builds, emitted chunk contents, production gzip budget, browser picker timing, download policy, and actual URL revocation. Host integration is still pending, so lazy loading and first-load resource exclusion remain **Unverified**. T1 and its tests were excluded as requested.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/002-app-host/spec.md (all; assumptions 2 and 3; R6, R6.a-c, R7, R7.a) and tasks.md (row T2; T8 runs the real-app e2e); docs/review/spec-002-critique-codex.md
- docs/specs/001-sheet/spec.md R2.b and R22 (build guard; first-load budget)
- src/sdk/os.d.ts (fs and ui.openFile/saveFile contracts)
- The change under review (T2 only): new files src/sheet/host/memfs.ts, fs.ts, resources.ts, virtual.d.ts, scripts/host-resources.ts, tests/unit/host-fs.test.ts, tests/fixtures/sheet-guard/host.ts, and the diffs of vite.config.ts and tests/unit/sheet-guard.test.ts (`git diff HEAD -- vite.config.ts tests/unit/sheet-guard.test.ts`). Ignore src/sheet/host/os.ts and its tests (T1, reviewed separately).
- For semantics the host must match (read only): the old OS fs in src/fs/ (vfs.ts, overlay.ts, path.ts, errors.ts) and how the four apps use fs/openFile/saveFile: src/apps/writer/main.ts, paint/main.ts, tracker/main.ts, castlesiege/*.ts, src/apps/lib/*.ts.

Task: review T2 (memory filesystem, resources, download rule). Check:
1. fs semantics vs the old OS for every call the four apps and src/apps/lib make (resolve, ~ and relative paths, errors and codes, stat shape, readdir order, mkdir -p behaviour, writeFile of strings vs bytes, append, exists) — anything an app relies on that differs;
2. the document-path rule (downloads for all paths except ~/.config/, /tmp/ and system paths) and its boundaries; download on every write to a document path incl. bundled/opened documents; no download for failed writes; Blob URL revoke; the blocked-download seam and the test hook (is `globalThis.__hostBlockDownloads` reachable/abusable by a visitor? acceptable?); `navigator.userActivation` use;
3. openFile copy to ~/Imports/<name>, cancel detection (cancel event + focus fallback) and its failure modes; saveFile path, name sanitising (path traversal, slashes, empty, dot names), filter extension;
4. the resource table: only the allowlist, built at build time via a virtual module, binary decode correctness, no src/apps module ids in /next chunks (001 R2.b), loaded lazily with the host (not first load), size;
5. no storage or IndexedDB use (R7); memory limits;
6. tests that cannot fail or test helpers instead of behaviour.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, old OS unchanged. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
