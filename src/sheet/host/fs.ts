// spec 002 R6, R7: the hosted apps' filesystem. One MemoryFs per page holds
// the resource table plus this visit's writes, in memory only (reload clears
// it; no browser storage, no IndexedDB). It imports no old-OS code (001
// R2.b). Each app gets a view (forApp) whose writes to a document path
// download the bytes to the visitor's machine.
import type { OS } from "../../sdk/os";
import { h } from "../../ui/dom";
import { MemFs, basename, extname, isInside, resolvePath } from "./memfs";
import { RESOURCES } from "./resources";

export const HOME = "/home/guest";
export const DOWNLOADS = `${HOME}/Downloads`;
export const IMPORTS = `${HOME}/Imports`;

/** Top-level folders of the old OS image (devpageos-final tag) plus /bin. */
const SYSTEM = [
  "/apps",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/proc",
  "/usr",
  "/var",
];
const NOT_DOCUMENTS = [...SYSTEM, "/tmp", `${HOME}/.config`];

/** R6: every path except ~/.config/, /tmp/ and system paths. `path` is absolute and normalized. */
export function isDocumentPath(path: string): boolean {
  return !NOT_DOCUMENTS.some((d) => path === d || isInside(path, d));
}

/**
 * A document write's download. The window shows downloadLink(offer) for the
 * last one: the browser gives no answer to an automatic download, so the
 * link stays the visitor's way to get the file.
 */
export interface DownloadOffer {
  name: string;
  /** Starts the download; call it from the visitor's press. */
  start(): void;
  /** true: an automatic download was tried; false: it was blocked (R6.c) */
  auto: boolean;
}

/**
 * True when an automatic download may start: there is user activation (where
 * the browser reports it) and the test hook `globalThis.__hostBlockDownloads`
 * is not set (R6.c).
 */
function canAutoDownload(): boolean {
  if ((globalThis as { __hostBlockDownloads?: boolean }).__hostBlockDownloads)
    return false;
  return !("userActivation" in navigator) || navigator.userActivation.isActive;
}

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".wav": "audio/wav",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".js": "text/javascript",
  ".json": "application/json",
};

/** Saves bytes as `name` through a Blob URL (as src/apps/lib/download.ts). */
export function downloadBytes(bytes: Uint8Array, name: string): void {
  // the apps' own formats (.trk, .siege) and unknown types are plain bytes, so
  // no browser renames them
  const type = TYPES[extname(name)] ?? "application/octet-stream";
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = h("a", { attrs: { href: url, download: name } });
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // the download has started from the URL by then
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The "Download <name>" link for a blocked download. */
export function downloadLink(offer: DownloadOffer): HTMLAnchorElement {
  const a = h("a", {
    class: "host-download",
    attrs: { href: "#" },
    text: `Download ${offer.name}`,
  });
  a.addEventListener("click", (e) => {
    e.preventDefault();
    offer.start();
  });
  return a;
}

/** How long the picker waits for `change` after the window gets focus back. */
const PICK_GRACE_MS = 1000;

/**
 * The browser file picker. Resolves the chosen file, or null on cancel.
 * Cancel is the input's `cancel` event or, as a fallback, the window getting
 * focus back with no file chosen within PICK_GRACE_MS. A `change` before then
 * wins. `signal` (the app's start ended) cancels it. It settles once.
 */
export function pickFile(
  filters: string[],
  signal?: AbortSignal,
): Promise<File | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);
    const input = h("input", { attrs: { type: "file" } });
    if (filters.length) input.accept = filters.join(",");
    input.style.display = "none";
    let timer = 0;
    let settled = false;
    const chosen = (): File | null => input.files?.[0] ?? null;
    const done = (file: File | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      signal?.removeEventListener("abort", onAbort);
      input.remove();
      resolve(file);
    };
    const onAbort = (): void => done(null);
    const onFocus = (): void => {
      clearTimeout(timer);
      timer = window.setTimeout(() => done(chosen()), PICK_GRACE_MS);
    };
    input.addEventListener("change", () => done(chosen()));
    input.addEventListener("cancel", () => done(chosen()));
    window.addEventListener("focus", onFocus);
    signal?.addEventListener("abort", onAbort);
    document.body.append(input);
    input.click();
  });
}

export interface AppFileDeps {
  /** Asks the visitor for a file name (the host's prompt); null = cancel. */
  askName(defaultName: string): Promise<string | null>;
  /** Every document write: show downloadLink(offer) for the latest one. */
  onDownloadOffered(offer: DownloadOffer): void;
  /** A file operation failed outside the app's own error handling (an import). */
  onError(message: string): void;
  /** The file picker; defaults to pickFile. */
  pickFile?(filters: string[], signal?: AbortSignal): Promise<File | null>;
  /** R10: aborted when the app's start ends: its writes do nothing, its
   * picker closes */
  signal?: AbortSignal;
}

export interface AppFiles {
  fs: OS["fs"];
  openFile: OS["ui"]["openFile"];
  saveFile: OS["ui"]["saveFile"];
}

export class MemoryFs {
  readonly vfs: MemFs;

  constructor(resources: Record<string, string | Uint8Array> = RESOURCES) {
    this.vfs = new MemFs(resources, [HOME, DOWNLOADS, IMPORTS, "/tmp"]);
  }

  /** One app's view: OS.fs plus ui.openFile and ui.saveFile. */
  forApp(deps: AppFileDeps): AppFiles {
    const vfs = this.vfs;
    const res = (p: string): string => resolvePath(p, HOME, HOME);
    const ok = (): boolean => !deps.signal?.aborted;

    const offer = (bytes: Uint8Array, name: string): void => {
      const start = (): void => downloadBytes(bytes, name);
      const auto = canAutoDownload();
      if (auto) start();
      deps.onDownloadOffered({ name, start, auto });
    };

    const fs: OS["fs"] = {
      readFile: (p) => vfs.readFile(res(p)),
      readText: (p) => vfs.readText(res(p)),
      async writeFile(p, data, o) {
        if (!ok()) return;
        const abs = res(p);
        // the bytes this write left, taken before any other write can run
        const bytes = vfs.write(abs, data, o);
        if (isDocumentPath(abs)) offer(bytes.slice(), basename(abs));
      },
      readdir: (p) => vfs.readdir(res(p)),
      stat: (p) => vfs.stat(res(p)),
      // R10: an ended start's calls change nothing
      async mkdir(p, o) {
        if (ok()) await vfs.mkdir(res(p), o);
      },
      async rm(p, o) {
        if (ok()) await vfs.rm(res(p), o);
      },
      async rename(a, b) {
        if (ok()) await vfs.rename(res(a), res(b));
      },
      exists: (p) => vfs.exists(res(p)),
      watch: (p, cb) => vfs.watch(res(p), cb),
      resolve: res,
    };

    return {
      fs,
      async openFile(opts) {
        const file = await (deps.pickFile ?? pickFile)(
          opts?.filters ?? [],
          deps.signal,
        );
        if (!file || !ok()) return null;
        const path = `${IMPORTS}/${basename(file.name) || "file"}`;
        // apps await openFile outside their own catch: report here, give null
        try {
          vfs.checkWrite(path, file.size);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!ok()) return null;
          // the import itself is not a download
          vfs.write(path, bytes);
          return path;
        } catch (err) {
          deps.onError(err instanceof Error ? err.message : String(err));
          return null;
        }
      },
      async saveFile(opts) {
        const answer = await deps.askName(opts?.defaultName ?? "untitled");
        if (!ok()) return null;
        let name = basename((answer ?? "").trim());
        if (!name || name === "." || name === "..") return null;
        const filters = opts?.filters ?? [];
        if (filters.length === 1 && extname(name) === "") name += filters[0];
        return `${DOWNLOADS}/${name}`;
      },
    };
  }
}
