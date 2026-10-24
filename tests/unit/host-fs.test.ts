// spec 002 T2: memory filesystem, resource table and the download rule (R6, R7).
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOME,
  MemoryFs,
  downloadLink,
  isDocumentPath,
  pickFile,
  type DownloadOffer,
} from "../../src/sheet/host/fs";
import { RESOURCES } from "../../src/sheet/host/resources";

const root = resolve(import.meta.dirname, "../..");
const dec = new TextDecoder();

/** Every automatic download: name and bytes, from the Blob URL the anchor clicked. */
let downloads: { name: string; bytes: Uint8Array }[];
let blobs: Map<string, Blob>;

beforeEach(() => {
  downloads = [];
  blobs = new Map();
  let n = 0;
  URL.createObjectURL = (b: Blob | MediaSource) => {
    const url = `blob:test/${n++}`;
    blobs.set(url, b as Blob);
    return url;
  };
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    const blob = blobs.get(this.href);
    if (!blob || !this.download) return;
    const entry = { name: this.download, bytes: new Uint8Array(0) };
    downloads.push(entry);
    pending.push(
      blob.arrayBuffer().then((b) => {
        entry.bytes = new Uint8Array(b);
      }),
    );
  });
});
let pending: Promise<void>[] = [];
const settled = async () => {
  await Promise.all(pending);
  pending = [];
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { __hostBlockDownloads?: boolean })
    .__hostBlockDownloads;
});

function app(
  mem = new MemoryFs(),
  over: Partial<Parameters<MemoryFs["forApp"]>[0]> = {},
) {
  const offers: DownloadOffer[] = [];
  const errors: string[] = [];
  const files = mem.forApp({
    askName: async (name) => name,
    onDownloadOffered: (o) => offers.push(o),
    onError: (m) => errors.push(m),
    ...over,
  });
  /** offers the browser did not start automatically */
  const blocked = {
    get list() {
      return offers.filter((o) => !o.auto);
    },
  };
  return { mem, files, offers, errors, blocked };
}

describe("document-path rule (R6)", () => {
  it.each([
    ["/home/guest/Documents/a.txt", true],
    ["/home/guest/Downloads/n.txt", true],
    ["/home/guest/Imports/p.png", true],
    ["/home/guest/a.txt", true],
    ["/home/guest/.configs/x.json", true],
    ["/home/guest/.config.json", true],
    ["/tmpfile", true],
    ["/etcetera/x", true],
    ["/x.txt", true],
    ["/home/guest/.config/paint.json", false],
    ["/home/guest/.config/a/b.json", false],
    ["/tmp/x", false],
    ["/tmp/a/b", false],
    ["/etc/desktop/wallpaper.png", false],
    ["/usr/share/x", false],
    ["/apps/paint/manifest.json", false],
    ["/bin/x", false],
    ["/boot/kernel", false],
    ["/var/log/x", false],
    ["/proc/1", false],
    ["/dev/null", false],
  ])("%s → %s", (p, want) => {
    expect(isDocumentPath(p)).toBe(want);
  });

  it("downloads a document write under its base name with the bytes", async () => {
    const { files } = app();
    await files.fs.writeFile("~/Downloads/n.txt", "hello");
    await files.fs.writeFile("~/Downloads/n.txt", "hello again");
    await settled();
    expect(downloads.map((d) => [d.name, dec.decode(d.bytes)])).toEqual([
      ["n.txt", "hello"],
      ["n.txt", "hello again"],
    ]);
    expect(await files.fs.readText("/home/guest/Downloads/n.txt")).toBe(
      "hello again",
    );
  });

  it("downloads the whole file after an append", async () => {
    const { files } = app();
    await files.fs.writeFile("~/Downloads/log.txt", "a");
    await files.fs.writeFile("~/Downloads/log.txt", "b", { append: true });
    await settled();
    expect(dec.decode(downloads[1].bytes)).toBe("ab");
  });

  it("does not download config, /tmp or system writes", async () => {
    const { files, offers } = app();
    await files.fs.mkdir("~/.config", { recursive: true });
    await files.fs.writeFile("~/.config/x.json", "{}");
    await files.fs.writeFile("/tmp/t", "t");
    await files.fs.mkdir("/etc/desktop", { recursive: true });
    await files.fs.writeFile("/etc/desktop/wallpaper.png", new Uint8Array([1]));
    await settled();
    expect(downloads).toEqual([]);
    expect(offers).toEqual([]);
    expect(await files.fs.readText("~/.config/x.json")).toBe("{}");
  });

  it("does not download when the write fails", async () => {
    const { files } = app();
    await expect(files.fs.writeFile("~/Nope/a.txt", "x")).rejects.toThrow(
      /No such file/,
    );
    expect(downloads).toEqual([]);
  });
});

describe("blocked download fallback (R6.c hook)", () => {
  it("offers a Download <name> link instead, which downloads the bytes", async () => {
    (globalThis as { __hostBlockDownloads?: boolean }).__hostBlockDownloads =
      true;
    const { files, blocked } = app();
    await files.fs.writeFile("~/Downloads/n.txt", "hello");
    expect(downloads).toEqual([]);
    expect(blocked.list.map((o) => o.name)).toEqual(["n.txt"]);
    const link = downloadLink(blocked.list[0]);
    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe("Download n.txt");
    link.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settled();
    expect(downloads.map((d) => [d.name, dec.decode(d.bytes)])).toEqual([
      ["n.txt", "hello"],
    ]);
  });

  it("with activation, downloads automatically and also offers the link", async () => {
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: true, hasBeenActive: true },
    });
    try {
      const { files, offers } = app();
      await files.fs.writeFile("~/Downloads/n.txt", "x");
      expect(downloads.map((d) => d.name)).toEqual(["n.txt"]);
      expect(offers.map((o) => [o.name, o.auto])).toEqual([["n.txt", true]]);
      downloadLink(offers[0]).dispatchEvent(new MouseEvent("click"));
      await settled();
      expect(downloads.map((d) => dec.decode(d.bytes))).toEqual(["x", "x"]);
    } finally {
      delete (navigator as { userActivation?: unknown }).userActivation;
    }
  });

  it("downloads each concurrent write's own result", async () => {
    const { files } = app();
    await Promise.all([
      files.fs.writeFile("~/Downloads/c.txt", "A"),
      files.fs.writeFile("~/Downloads/c.txt", "B"),
    ]);
    await Promise.all([
      files.fs.writeFile("~/Downloads/d.txt", "1"),
      files.fs.writeFile("~/Downloads/d.txt", "2", { append: true }),
    ]);
    await settled();
    expect(downloads.map((d) => [d.name, dec.decode(d.bytes)])).toEqual([
      ["c.txt", "A"],
      ["c.txt", "B"],
      ["d.txt", "1"],
      ["d.txt", "12"],
    ]);
  });

  it("treats no user activation as blocked", async () => {
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false, hasBeenActive: true },
    });
    try {
      const { files, blocked } = app();
      await files.fs.writeFile("~/Downloads/n.txt", "x");
      expect(downloads).toEqual([]);
      expect(blocked.list).toHaveLength(1);
    } finally {
      delete (navigator as { userActivation?: unknown }).userActivation;
    }
  });
});

describe("openFile and saveFile (R6)", () => {
  it("saveFile returns ~/Downloads/<name>, cancel → null", async () => {
    const asked: string[] = [];
    let answer: string | null = "n.txt";
    const { files } = app(undefined, {
      askName: async (name) => (asked.push(name), answer),
    });
    expect(await files.saveFile({ defaultName: "untitled.txt" })).toBe(
      `${HOME}/Downloads/n.txt`,
    );
    expect(asked).toEqual(["untitled.txt"]);
    answer = "dir/../evil/x.md";
    expect(await files.saveFile()).toBe(`${HOME}/Downloads/x.md`);
    answer = "song";
    expect(await files.saveFile({ filters: [".trk"] })).toBe(
      `${HOME}/Downloads/song.trk`,
    );
    answer = null;
    expect(await files.saveFile({ defaultName: "a.txt" })).toBeNull();
    answer = "..";
    expect(await files.saveFile()).toBeNull();
    answer = "  ";
    expect(await files.saveFile({ defaultName: "a.txt" })).toBeNull();
  });

  it("openFile copies the chosen file to ~/Imports/<name> without a download", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    let filters: string[] = [];
    const { files } = app(undefined, {
      pickFile: async (f) => ((filters = f), new File([bytes], "p.png")),
    });
    const path = await files.openFile({ filters: [".png"] });
    expect(filters).toEqual([".png"]);
    expect(path).toBe(`${HOME}/Imports/p.png`);
    expect([...(await files.fs.readFile(path!))]).toEqual([...bytes]);
    await settled();
    expect(downloads).toEqual([]);
    // a later Save of the opened file downloads it under its own name
    await files.fs.writeFile(path!, new Uint8Array([1, 2]));
    await settled();
    expect(downloads.map((d) => [d.name, [...d.bytes]])).toEqual([
      ["p.png", [1, 2]],
    ]);
  });

  it("openFile refuses an oversized file without reading it: error + null", async () => {
    const file = new File(["x"], "big.png");
    Object.defineProperty(file, "size", { value: 9 * 1024 * 1024 });
    const read = vi.spyOn(file, "arrayBuffer");
    const { files, errors } = app(undefined, { pickFile: async () => file });
    expect(await files.openFile()).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(errors).toEqual([`${HOME}/Imports/big.png: File too large`]);
    expect(await files.fs.exists(`${HOME}/Imports/big.png`)).toBe(false);
  });

  it("a write over the quota throws ENOSPC and downloads nothing", async () => {
    const { files, offers } = app();
    const chunk = new Uint8Array(8 * 1024 * 1024);
    for (let i = 0; i < 6; i++) await files.fs.writeFile(`/tmp/${i}`, chunk);
    await files.fs.writeFile("~/Downloads/q.txt", "x");
    const before = downloads.length;
    await expect(
      files.fs.writeFile("~/Downloads/q.txt", chunk),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    await expect(
      files.fs.writeFile("~/Downloads/q.txt", chunk.subarray(0, 3 << 20), {
        append: true,
      }),
    ).rejects.toMatchObject({ code: "ENOSPC" });
    expect(downloads.length).toBe(before);
    expect(offers.length).toBe(before);
    expect(await files.fs.readText("~/Downloads/q.txt")).toBe("x");
  });

  it("an append over the file limit throws EFBIG before merging", async () => {
    const { files } = app();
    const big = new Uint8Array(8 * 1024 * 1024);
    await files.fs.writeFile("/tmp/f", big);
    await expect(
      files.fs.writeFile("/tmp/f", "x", { append: true }),
    ).rejects.toMatchObject({ code: "EFBIG" });
  });

  it("openFile cancel → null", async () => {
    const { files } = app(undefined, { pickFile: async () => null });
    expect(await files.openFile()).toBeNull();
  });

  it("R10 after the start's signal aborts, writes, folders and imports change nothing and offer no download", async () => {
    const life = new AbortController();
    let pick!: (f: File) => void;
    const { files, offers } = app(undefined, {
      signal: life.signal,
      pickFile: () => new Promise((r) => (pick = r)),
    });
    await files.fs.writeFile("~/a.txt", "a");
    const opening = files.openFile();
    life.abort();
    await files.fs.writeFile("~/a.txt", "late");
    await files.fs.mkdir("~/d");
    await files.fs.rename("~/a.txt", "~/b.txt");
    await files.fs.rm("~/a.txt");
    pick(new File(["x"], "x.txt"));
    expect(await opening).toBeNull();
    expect(await files.saveFile()).toBeNull();
    expect(await files.fs.readText("~/a.txt")).toBe("a");
    expect(await files.fs.exists("~/d")).toBe(false);
    expect(await files.fs.exists("~/Imports/x.txt")).toBe(false);
    expect(offers.map((o) => o.name)).toEqual(["a.txt"]);
  });

  describe("the browser picker", () => {
    let click: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      click = vi
        .spyOn(HTMLInputElement.prototype, "click")
        .mockImplementation(() => {});
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      document.body.replaceChildren();
    });
    const shown = () => document.querySelector<HTMLInputElement>("input")!;
    const choose = (input: HTMLInputElement, file: File) =>
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });

    it("an aborted signal closes it: null, input and focus listener removed", async () => {
      const life = new AbortController();
      const off = vi.spyOn(window, "removeEventListener");
      const p = pickFile([], life.signal);
      expect(shown()).not.toBeNull();
      life.abort();
      expect(await p).toBeNull();
      expect(document.querySelector("input")).toBeNull();
      expect(off).toHaveBeenCalledWith("focus", expect.any(Function));
      expect(await pickFile([], life.signal)).toBeNull();
      expect(click).toHaveBeenCalledTimes(1);
    });

    it("opens a file input with the filters; cancel → null, input removed", async () => {
      const p = pickFile([".png", ".gif"]);
      const input = shown();
      expect(click).toHaveBeenCalledTimes(1);
      expect(input.type).toBe("file");
      expect(input.accept).toBe(".png,.gif");
      input.dispatchEvent(new Event("cancel"));
      expect(await p).toBeNull();
      expect(input.isConnected).toBe(false);
    });

    it("change → the file", async () => {
      const p = pickFile([]);
      const file = new File(["x"], "a.txt");
      choose(shown(), file);
      shown().dispatchEvent(new Event("change"));
      expect(await p).toBe(file);
    });

    it("focus back and no change → null after the grace time", async () => {
      const p = pickFile([]);
      const input = shown();
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toBeNull();
      expect(input.isConnected).toBe(false);
    });

    it("focus before a late change → the file", async () => {
      const p = pickFile([]);
      const input = shown();
      const file = new File(["x"], "a.txt");
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(500);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(700);
      choose(input, file);
      input.dispatchEvent(new Event("change"));
      expect(await p).toBe(file);
    });

    it("files already chosen when the grace time ends → the file", async () => {
      const p = pickFile([]);
      const file = new File(["x"], "a.txt");
      choose(shown(), file);
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p).toBe(file);
    });

    it("cancel and change both firing settle once", async () => {
      const settledWith: (File | null)[] = [];
      const p = pickFile([]).then((f) => settledWith.push(f));
      const input = shown();
      input.dispatchEvent(new Event("cancel"));
      choose(input, new File(["x"], "a.txt"));
      input.dispatchEvent(new Event("change"));
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(2000);
      await p;
      expect(settledWith).toEqual([null]);
    });
  });
});

describe("resources (R7)", () => {
  it("holds the assumption-3 text resources", async () => {
    const { files } = app();
    for (const t of ["default", "night"]) {
      expect(await files.fs.readText(`/etc/themes/${t}.json`)).toBe(
        readFileSync(join(root, `system/etc/themes/${t}.json`), "utf8"),
      );
    }
    expect(await files.fs.readText("/etc/associations.json")).toBe(
      readFileSync(join(root, "system/etc/associations.json"), "utf8"),
    );
    const ids = (await files.fs.readdir("/apps")).map((e) => e.name);
    expect(ids).toEqual(["castlesiege", "paint", "tracker", "writer"]);
    for (const id of ids) {
      expect(await files.fs.readText(`/apps/${id}/manifest.json`)).toBe(
        readFileSync(join(root, `src/apps/${id}/manifest.json`), "utf8"),
      );
    }
  });

  it("holds every icon with its exact bytes and size", async () => {
    const { files } = app();
    const dir = join(root, "system/usr/share/icons");
    const names = readdirSync(dir)
      .filter((n) => n.endsWith(".png"))
      .sort();
    const listed = await files.fs.readdir("/usr/share/icons");
    expect(listed.map((e) => e.name)).toEqual(names);
    for (const name of names) {
      const want = readFileSync(join(dir, name));
      const p = `/usr/share/icons/${name}`;
      expect((await files.fs.stat(p)).size).toBe(want.length);
      expect(Buffer.from(await files.fs.readFile(p)).equals(want)).toBe(true);
    }
  });

  it("holds the CastleSiege songs as text (003 T1)", async () => {
    const { files } = app();
    for (const p of [
      "/usr/share/music/castlesiege-theme.trk",
      "/usr/share/music/castlesiege-victory.trk",
    ]) {
      expect(typeof RESOURCES[p]).toBe("string");
      expect(await files.fs.readText(p)).toBe(
        readFileSync(join(root, "system", p), "utf8"),
      );
    }
  });

  it("holds only the allowlist", () => {
    const allowed =
      /^\/(etc\/themes\/(default|night)\.json|etc\/associations\.json|apps\/(castlesiege|paint|tracker|writer)\/manifest\.json|usr\/share\/icons\/[\w-]+\.png|usr\/share\/music\/castlesiege-(theme|victory)\.trk|home\/guest\/Music\/demo\.trk)$/;
    expect(Object.keys(RESOURCES).length).toBeGreaterThan(60);
    for (const p of Object.keys(RESOURCES)) expect(p).toMatch(allowed);
  });

  it("has the home folders, keeps writes per visit and shares them across apps", async () => {
    const mem = new MemoryFs();
    const a = app(mem).files;
    const b = app(mem).files;
    for (const d of ["~", "~/Downloads", "~/Imports", "/tmp"])
      expect((await a.fs.stat(d)).type).toBe("dir");
    await a.fs.writeFile("/tmp/x", "1");
    expect(await b.fs.readText("/tmp/x")).toBe("1");
    // a new page load is a new MemoryFs: writes are gone
    expect(await app().files.fs.exists("/tmp/x")).toBe(false);
  });

  it("keeps the old fs semantics: ~ and relative paths, errors, readdir order", async () => {
    const { files } = app();
    expect(files.fs.resolve("~/a/../b.txt")).toBe(`${HOME}/b.txt`);
    expect(files.fs.resolve("c.txt")).toBe(`${HOME}/c.txt`);
    await expect(files.fs.readText("/nope")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(files.fs.readText("/etc")).rejects.toMatchObject({
      code: "EISDIR",
    });
    const st = await files.fs.stat("/etc/themes/night.json");
    expect(st).toMatchObject({ type: "file", layer: "system" });
    await files.fs.writeFile("/tmp/b", "");
    await files.fs.writeFile("/tmp/a", "");
    expect((await files.fs.readdir("/tmp")).map((e) => e.name)).toEqual([
      "a",
      "b",
    ]);
    expect((await files.fs.stat("/tmp/a")).layer).toBe("modified");
  });

  it("keeps the old fs error codes for mkdir, rm and rename", async () => {
    const { files } = app();
    const code = (p: Promise<unknown>) =>
      p.then(
        () => "ok",
        (e: { code: string; message: string }) => e.code,
      );
    expect(await code(files.fs.mkdir("/tmp/a/b"))).toBe("ENOENT");
    expect(await code(files.fs.mkdir("/tmp/a/b", { recursive: true }))).toBe(
      "ok",
    );
    expect(await code(files.fs.mkdir("/tmp/a"))).toBe("EEXIST");
    await files.fs.writeFile("/tmp/a/b/f", "x");
    expect(await code(files.fs.writeFile("/tmp/a/b/f/g", "x"))).toBe("ENOTDIR");
    expect(await code(files.fs.writeFile("/tmp/a", "x"))).toBe("EISDIR");
    expect(await code(files.fs.rm("/tmp/a"))).toBe("ENOTEMPTY");
    expect(await code(files.fs.rm("/"))).toBe("EACCES");
    expect(await code(files.fs.rename("/tmp/a", "/tmp/a/c"))).toBe("EINVAL");
    expect(await code(files.fs.rename("/tmp/a", "/tmp/z"))).toBe("ok");
    expect(await files.fs.readText("/tmp/z/b/f")).toBe("x");
    expect(await files.fs.exists("/tmp/a")).toBe(false);
    expect(await code(files.fs.rm("/tmp/z", { recursive: true }))).toBe("ok");
    expect(await files.fs.exists("/tmp/z/b/f")).toBe(false);
    expect(await code(files.fs.readText("x".repeat(300)))).toBe("EINVAL");
    await expect(files.fs.readText("/nope")).rejects.toThrow(
      "/nope: No such file or directory",
    );
  });

  it("reports changes to watchers of the path and its folder", async () => {
    const { files } = app();
    const seen: string[] = [];
    const off = files.fs.watch("/tmp", (e) => seen.push(`${e.type} ${e.path}`));
    await files.fs.writeFile("/tmp/w", "1");
    await files.fs.writeFile("/tmp/w", "2");
    await files.fs.rm("/tmp/w");
    off();
    await files.fs.writeFile("/tmp/w", "3");
    expect(seen).toEqual(["create /tmp/w", "modify /tmp/w", "delete /tmp/w"]);
  });

  it("never touches browser storage or IndexedDB", async () => {
    const idb = vi.spyOn(indexedDB, "open");
    const ls = vi.spyOn(Storage.prototype, "setItem");
    const lg = vi.spyOn(Storage.prototype, "getItem");
    const { files } = app(undefined, {
      pickFile: async () => new File(["x"], "a.txt"),
    });
    await files.fs.writeFile("~/Downloads/a.txt", "x");
    await files.fs.mkdir("~/.config", { recursive: true });
    await files.fs.writeFile("~/.config/a.json", "{}");
    await files.openFile();
    await files.fs.readFile("/usr/share/icons/app.png");
    expect(idb).not.toHaveBeenCalled();
    expect(ls).not.toHaveBeenCalled();
    expect(lg).not.toHaveBeenCalled();
  });
});
