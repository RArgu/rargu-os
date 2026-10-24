// spec 002 R7: a small in-memory filesystem for the app host, standing alone
// (001 R2.b: no src/fs/ code on /next). It keeps the old OS's semantics that
// the apps rely on: "~" and relative paths, FsError codes and messages, the
// Stat shape (layer "system" for the resource table, "modified" for this
// visit's writes), name-sorted readdir, and change events for watch.
import type { DirEntry, FsEvent, Stat } from "../../sdk/os";

// ----- paths (as src/fs/path.ts) -----

const MAX_PATH = 1024;
const MAX_NAME = 255;

export function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

/** Resolves against cwd, expanding a leading "~" to home. */
export function resolvePath(path: string, cwd: string, home: string): string {
  let p = path;
  if (p === "~" || p.startsWith("~/")) p = home + p.slice(1);
  else if (!p.startsWith("/")) p = cwd + "/" + p;
  return normalize(p);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Extension including the dot, lowercased; "" when there is none. */
export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}

export function isInside(path: string, dir: string): boolean {
  return dir === "/" ? path !== "/" : path.startsWith(dir + "/");
}

// ----- errors (as src/fs/errors.ts) -----

const MESSAGES = {
  ENOENT: "No such file or directory",
  EEXIST: "File exists",
  EISDIR: "Is a directory",
  ENOTDIR: "Not a directory",
  ENOTEMPTY: "Directory not empty",
  EACCES: "Permission denied",
  EFBIG: "File too large",
  ENOSPC: "No space left on device",
  EINVAL: "Invalid argument",
};
export type FsErrorCode = keyof typeof MESSAGES;

export class FsError extends Error {
  readonly reason: string;
  constructor(
    readonly code: FsErrorCode,
    readonly path: string,
  ) {
    super(`${path}: ${MESSAGES[code]}`);
    this.name = "FsError";
    this.reason = MESSAGES[code];
  }
}

// ----- the tree -----

export const MAX_FILE = 8 * 1024 * 1024;
export const QUOTA = 50 * 1024 * 1024;

interface Node {
  t: "file" | "dir";
  d: Uint8Array;
  m: number;
  /** from the resource table, not written this visit */
  sys: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const EMPTY = new Uint8Array(0);

export class MemFs {
  private nodes = new Map<string, Node>();
  private watchers = new Map<string, Set<(ev: FsEvent) => void>>();
  private used = 0;

  /** `files`: path → contents, read-only "system" layer; parents are created. */
  constructor(files: Record<string, string | Uint8Array>, dirs: string[]) {
    const now = Date.now();
    this.nodes.set("/", { t: "dir", d: EMPTY, m: now, sys: true });
    const addDir = (p: string): void => {
      if (this.nodes.has(p)) return;
      addDir(dirname(p));
      this.nodes.set(p, { t: "dir", d: EMPTY, m: now, sys: true });
    };
    for (const d of dirs) addDir(normalize(d));
    for (const [p, data] of Object.entries(files)) {
      const path = normalize(p);
      addDir(dirname(path));
      const d = typeof data === "string" ? encoder.encode(data) : data;
      this.nodes.set(path, { t: "file", d, m: now, sys: true });
    }
  }

  private check(path: string): string {
    const p = normalize(path);
    if (p.length > MAX_PATH || p.split("/").some((n) => n.length > MAX_NAME))
      throw new FsError("EINVAL", p);
    return p;
  }

  private need(p: string): Node {
    const n = this.nodes.get(p);
    if (!n) throw new FsError("ENOENT", p);
    return n;
  }

  private needParentDir(p: string): void {
    const parent = this.nodes.get(dirname(p));
    if (!parent) throw new FsError("ENOENT", p);
    if (parent.t !== "dir") throw new FsError("ENOTDIR", dirname(p));
  }

  private children(p: string): string[] {
    const prefix = p === "/" ? "/" : p + "/";
    return [...this.nodes.keys()].filter(
      (k) =>
        k !== "/" &&
        k.startsWith(prefix) &&
        k.indexOf("/", prefix.length) === -1,
    );
  }

  private emit(type: FsEvent["type"], path: string): void {
    const ev = { type, path };
    for (const key of new Set([path, dirname(path)]))
      for (const cb of [...(this.watchers.get(key) ?? [])]) cb(ev);
  }

  watch(path: string, cb: (ev: FsEvent) => void): () => void {
    const p = normalize(path);
    let set = this.watchers.get(p);
    if (!set) this.watchers.set(p, (set = new Set()));
    set.add(cb);
    return () => set.delete(cb);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const p = this.check(path);
    const n = this.need(p);
    if (n.t === "dir") throw new FsError("EISDIR", p);
    return n.d;
  }

  async readText(path: string): Promise<string> {
    return decoder.decode(await this.readFile(path));
  }

  /**
   * Throws EFBIG or ENOSPC (and the path errors of a write) when `size` bytes
   * written to `path` (added to it with `append`) would not fit. Allocates
   * nothing.
   */
  checkWrite(path: string, size: number, append = false): void {
    const p = this.check(path);
    if (p === "/") throw new FsError("EISDIR", p);
    this.needParentDir(p);
    const old = this.nodes.get(p);
    if (old?.t === "dir") throw new FsError("EISDIR", p);
    const total = append && old ? old.d.length + size : size;
    if (total > MAX_FILE) throw new FsError("EFBIG", p);
    const oldSize = old && !old.sys ? old.d.length : 0;
    if (this.used - oldSize + total > QUOTA) throw new FsError("ENOSPC", p);
  }

  /** Writes at once and returns the file's new contents (do not change them). */
  write(
    path: string,
    data: Uint8Array | string,
    opts: { append?: boolean } = {},
  ): Uint8Array {
    const p = this.check(path);
    let bytes = typeof data === "string" ? encoder.encode(data) : data;
    this.checkWrite(p, bytes.length, opts.append);
    const old = this.nodes.get(p);
    if (opts.append && old) {
      const merged = new Uint8Array(old.d.length + bytes.length);
      merged.set(old.d);
      merged.set(bytes, old.d.length);
      bytes = merged;
    } else if (typeof data !== "string") bytes = data.slice();
    this.used += bytes.length - (old && !old.sys ? old.d.length : 0);
    this.nodes.set(p, { t: "file", d: bytes, m: Date.now(), sys: false });
    this.emit(old ? "modify" : "create", p);
    return bytes;
  }

  async writeFile(
    path: string,
    data: Uint8Array | string,
    opts?: { append?: boolean },
  ): Promise<void> {
    this.write(path, data, opts);
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const p = this.check(path);
    if (this.need(p).t !== "dir") throw new FsError("ENOTDIR", p);
    return this.children(p)
      .map((k) => {
        const n = this.nodes.get(k)!;
        return { name: basename(k), type: n.t, size: n.d.length, mtime: n.m };
      })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async stat(path: string): Promise<Stat> {
    const p = this.check(path);
    const n = this.need(p);
    return {
      type: n.t,
      size: n.d.length,
      mtime: n.m,
      mode: n.t === "dir" ? "drwxr-xr-x" : "-rw-r--r--",
      readonly: false,
      layer: n.sys ? "system" : "modified",
    };
  }

  async exists(path: string): Promise<boolean> {
    return this.nodes.has(normalize(path));
  }

  async mkdir(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const p = this.check(path);
    const old = this.nodes.get(p);
    if (old) {
      if (opts.recursive && old.t === "dir") return;
      throw new FsError("EEXIST", p);
    }
    if (!this.nodes.has(dirname(p))) {
      if (!opts.recursive) throw new FsError("ENOENT", p);
      await this.mkdir(dirname(p), opts);
    }
    this.needParentDir(p);
    this.nodes.set(p, { t: "dir", d: EMPTY, m: Date.now(), sys: false });
    this.emit("create", p);
  }

  /** The path and everything under it. */
  private subtree(p: string): string[] {
    return [...this.nodes.keys()].filter((k) => k === p || isInside(k, p));
  }

  private drop(keys: string[]): void {
    for (const k of keys) {
      const n = this.nodes.get(k);
      if (n && !n.sys) this.used -= n.d.length;
      this.nodes.delete(k);
    }
  }

  async rm(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const p = this.check(path);
    if (p === "/") throw new FsError("EACCES", p);
    const n = this.need(p);
    if (n.t === "dir" && !opts.recursive && this.children(p).length > 0)
      throw new FsError("ENOTEMPTY", p);
    this.drop(this.subtree(p));
    this.emit("delete", p);
  }

  async rename(from: string, to: string): Promise<void> {
    const a = this.check(from);
    const b = this.check(to);
    if (a === "/" || b === "/") throw new FsError("EACCES", a);
    const src = this.need(a);
    if (a === b) return;
    if (isInside(b, a)) throw new FsError("EINVAL", b);
    this.needParentDir(b);
    const dest = this.nodes.get(b);
    if (dest) {
      if (dest.t === "dir" && src.t === "file") throw new FsError("EISDIR", b);
      if (dest.t === "file" && src.t === "dir") throw new FsError("ENOTDIR", b);
      if (dest.t === "dir" && this.children(b).length > 0)
        throw new FsError("ENOTEMPTY", b);
      this.drop([b]);
    }
    const now = Date.now();
    for (const k of this.subtree(a)) {
      const n = this.nodes.get(k)!;
      this.nodes.delete(k);
      if (n.sys) this.used += n.d.length;
      this.nodes.set(b + k.slice(a.length), { ...n, m: now, sys: false });
    }
    this.emit("delete", a);
    this.emit("create", b);
  }
}
