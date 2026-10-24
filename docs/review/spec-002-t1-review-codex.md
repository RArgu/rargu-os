# Spec 002 T1: Codex implementation review

- **CLI:** `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex exec --ignore-user-config -m gpt-6.1-sol -c model_reasoning_effort="high" -s read-only --ephemeral --color never`
- **Model / effort / sandbox:** gpt-6.1-sol, high, read-only (settings from `docs/specs/README.md`)
- **Session id:** 01a168ea-344d-7ca1-9bfd-3f455ed09296 · **Tokens:** 88,087
- **Date:** 2026-10-23 · **Scope:** uncommitted T1 files against `9bbaf2d` (`src/sheet/host/os.ts`, `src/ui/dom.ts`
  diff, `tests/unit/host-os.test.ts`, `tests/fixtures/host/`)
- **Prompt:** below the output.

## Dispositions

| # | Finding | Disposition |
|---|---|---|
| 1 | Tests never exercise `sys.openExternal` safety | Accepted. |
| 2 | Member tests ignore forwarded arguments and return values | Accepted. |

Codex confirmed (observed, by scan) the implementer's assumption-1 corrections: all four apps use `win.root`; `id` is
part of the SDK `Window`; only `sys.sound.enabled()` is called.

## Codex output (verbatim)

I found two test gaps. No High severity defect emerged from static review.

**Observed** evidence comes from `nl -ba`, `rg -n`, and `git diff HEAD -- src/ui/dom.ts`. **Derived** consequences below were not executed.

1. **Medium — Tests bypass the production external-link safety checks.**  
   [tests/unit/host-os.test.ts:90](/Users/rargu/DevPageOS/tests/unit/host-os.test.ts:90)

   **Observed:** Every test supplies this replacement:

   ```ts
   openExternal: rec("sys.openExternal", undefined),
   ```

   Production selects it with `deps.openExternal ?? openExternal`. Consequently, the tests never exercise the scheme allowlist or `"noopener,noreferrer"` in [os.ts:149](/Users/rargu/DevPageOS/src/sheet/host/os.ts:149).

   **Derived:** Removing either protection would leave these tests unchanged. This leaves the requested `sys.openExternal` safety contract unverified.

   **Fix:** Add tests that omit the override and mock `window.open`. Assert HTTP, HTTPS, and mailto acceptance; unsafe-scheme rejection; and the exact target and features. No navigation is needed.

2. **Low — Member tests miss broken argument and return forwarding.**  
   [tests/unit/host-os.test.ts:19](/Users/rargu/DevPageOS/tests/unit/host-os.test.ts:19), [members.ts:9](/Users/rargu/DevPageOS/tests/fixtures/host/members.ts:9)

   **Observed:** The recorder ignores arguments:

   ```ts
   () => {
     calls.push(name);
     return value;
   };
   ```

   The fixture discards results, for example:

   ```ts
   await os.fs.readText("/a");
   os.fs.resolve("a");
   ```

   **Derived:** A wrapper that substitutes the wrong path or loses a return value can still pass. These tests establish member reachability, but provide limited verification of the SDK contract required by R1.

   **Fix:** Add focused assertions for forwarded arguments, returned values, and receiver binding. Include window options and `win.root` identity. Keep filesystem and window behavior tests in their assigned tasks.

Other review results:

- **Observed:** All four apps use `win.root`; `id` is required by the SDK but has no caller in the requested scan. Both fields fit the returned SDK `Window`. See [os.d.ts:168](/Users/rargu/DevPageOS/src/sdk/os.d.ts:168) and [writer/main.ts:110](/Users/rargu/DevPageOS/src/apps/writer/main.ts:110).
- **Observed:** The requested apps and helpers only call `sys.sound.enabled()`. The limited sound namespace fits those callers. See [castlesiege/main.ts:679](/Users/rargu/DevPageOS/src/apps/castlesiege/main.ts:679) and [lib/open.ts:223](/Users/rargu/DevPageOS/src/apps/lib/open.ts:223). I found no missing member used by the scanned code.
- **Derived:** Nested guards name unsupported members correctly. `then`, `toJSON`, symbols, and inherited conversion methods avoid false throws. Default enumeration and `in` behavior support the requested inspection cases. See [os.ts:127](/Users/rargu/DevPageOS/src/sheet/host/os.ts:127).
- **Observed:** Environment values are correct, and T1 contains no automatic `sys:policy` publication. The bus remains a pass-through; it does not prohibit callers from publishing that topic. See [os.ts:164](/Users/rargu/DevPageOS/src/sheet/host/os.ts:164).
- **Observed:** `scale()` is unchanged. The new overlay branch applies only without `#display`, preserving the existing display branch. See [dom.ts:68](/Users/rargu/DevPageOS/src/ui/dom.ts:68).
- **Observed:** T1 adds no forbidden runtime imports, storage calls, automatic requests, or dependencies.

**Not checked:** Type checking, lint, tests, builds, browser behavior, actual trap output, and old-OS regression results remain **Unverified**. Per your constraints, I ran no test or network commands and modified no files. The named T2 files were excluded.

## Prompt (verbatim)

You are an independent read-only reviewer for RArgu OS (the repo in the current directory). Do not modify files.

Read first:
- AGENTS.md
- docs/specs/002-app-host/spec.md (all; assumption 1 is the exact OS member list) and tasks.md (row T1; later rows for context only); docs/review/spec-002-critique-codex.md
- docs/specs/001-sheet/spec.md R2.b (build guard: no src/kernel, src/fs, src/wm, src/boot modules in /next; src/apps only via registered lazy app imports)
- src/sdk/os.d.ts
- The change under review (T1 only): new files src/sheet/host/os.ts, tests/unit/host-os.test.ts, tests/fixtures/host/*.ts, and the diff of src/ui/dom.ts (`git diff HEAD -- src/ui/dom.ts`). Ignore src/sheet/host/fs.ts, resources.ts and tests/unit/host-fs.test.ts (another task, being reworked).
- For context on how apps use OS: src/apps/{castlesiege,paint,tracker,writer}/main.ts and src/apps/lib/*.ts (grep for `os.` uses).

Task: review T1 (host OS object and member trap: R1, R15 unit part). Check:
1. exactly the members of assumption 1 are exposed and typed against src/sdk/os.d.ts; any other member throws an error naming it; the implementer added window `id` and `root` and limited `sys.sound` to `enabled()` — are those right against what the four apps and src/apps/lib actually touch (grep the code)? Is anything the apps use missing (it would throw at runtime)?
2. the Proxy trap: correctness for nested namespaces, `await`, JSON, string conversion, `in`, spread, `Object.keys`, symbols, `then`; no false throws on common introspection; the trap log for T8;
3. env values, `sys:policy` never published, `sys.openExternal` safety (scheme allowlist, noopener);
4. src/ui/dom.ts change: no behaviour change when `#display` exists (old OS); `scale()` = 1 without `#display`; `overlayRoot()` host root;
5. tests that cannot fail, or that test helpers instead of behaviour.

Constraints (owner rules): static site, no third-party requests, no visitor storage, no new dependencies, old OS behaviour unchanged. Do not run network, deploy, git-write or test commands; read-only commands only.

Answer format: findings ordered by severity (High / Medium / Low). Each finding: a title, path:line, the evidence (quote the code), why it is wrong against which requirement, and a concrete fix. Keep observed facts apart from inference. End with what you could not check.
