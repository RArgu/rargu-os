// 002 T1: R1.a (the host OS has exactly the members of assumption 1; any other
// member throws and is logged) and the unit part of R15 (env, scale, overlay).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OS, Window as OSWindow } from "../../src/sdk/os";
import {
  createOS,
  HostMemberError,
  resetTrapLog,
  trapLog,
  type HostDeps,
} from "../../src/sheet/host/os.ts";
import { overlayRoot, scale, setHostOverlayRoot } from "../../src/ui/dom.ts";
import members from "../fixtures/host/members.ts";
import kill from "../fixtures/host/kill.ts";
import reboot from "../fixtures/host/reboot.ts";

/** Fake implementations that record each call as "<namespace>.<member>". */
function fakeDeps(calls: string[], published: string[] = []): HostDeps {
  const rec =
    <T>(name: string, value: T) =>
    () => {
      calls.push(name);
      return value;
    };
  const winCall = (name: string) => () => void calls.push(`Window.${name}`);
  const win: OSWindow = {
    id: 7,
    root: document.createElement("div"),
    setTitle: winCall("setTitle"),
    setMenu: winCall("setMenu"),
    setSize: winCall("setSize"),
    setPosition: winCall("setPosition"),
    focus: winCall("focus"),
    close: winCall("close"),
    onClose: winCall("onClose"),
    onResize: winCall("onResize"),
    onFocus: winCall("onFocus"),
  };
  return {
    pid: 3,
    app: { id: "fixture", name: "Fixture", version: "1.0" },
    argv: ["--x"],
    log: (level) => void calls.push(`log.${level}`),
    fs: {
      readText: rec("fs.readText", Promise.resolve("")),
      readFile: rec("fs.readFile", Promise.resolve(new Uint8Array())),
      writeFile: rec("fs.writeFile", Promise.resolve()),
      readdir: rec("fs.readdir", Promise.resolve([])),
      stat: rec(
        "fs.stat",
        Promise.resolve({
          type: "file" as const,
          size: 0,
          mtime: 0,
          mode: "rw-",
          readonly: false,
          layer: "modified" as const,
        }),
      ),
      exists: rec("fs.exists", Promise.resolve(true)),
      mkdir: rec("fs.mkdir", Promise.resolve()),
      resolve: rec("fs.resolve", "/a"),
    },
    proc: {
      spawn: rec("proc.spawn", Promise.resolve(4)),
      list: rec("proc.list", []),
      onSignal: rec("proc.onSignal", undefined),
    },
    ui: {
      createWindow: rec("ui.createWindow", win),
      alert: rec("ui.alert", Promise.resolve()),
      confirm: rec("ui.confirm", Promise.resolve(true)),
      choose: rec("ui.choose", Promise.resolve(0)),
      prompt: rec("ui.prompt", Promise.resolve(null)),
      notify: rec("ui.notify", undefined),
      openFile: rec("ui.openFile", Promise.resolve(null)),
      saveFile: rec("ui.saveFile", Promise.resolve(null)),
    },
    bus: {
      publish: (topic) => {
        calls.push("bus.publish");
        published.push(topic);
      },
      subscribe: () => {
        calls.push("bus.subscribe");
        return () => void calls.push("bus.unsubscribe");
      },
    },
    theme: { get: rec("sys.theme.get", "default") },
    openExternal: rec("sys.openExternal", undefined),
  };
}

beforeEach(() => resetTrapLog());

describe("R1.a host OS members", () => {
  it("runs a fixture app that calls every member of assumption 1", async () => {
    const calls: string[] = [];
    const published: string[] = [];
    await members(createOS(fakeDeps(calls, published)));
    expect(calls).toEqual([
      "log.info",
      "fs.readText",
      "fs.readFile",
      "fs.writeFile",
      "fs.readdir",
      "fs.stat",
      "fs.exists",
      "fs.mkdir",
      "fs.resolve",
      "proc.spawn",
      "proc.list",
      "proc.onSignal",
      "ui.createWindow",
      "Window.setTitle",
      "Window.setMenu",
      "Window.setSize",
      "Window.setPosition",
      "Window.focus",
      "Window.onClose",
      "Window.onResize",
      "Window.onFocus",
      "Window.close",
      "ui.alert",
      "ui.confirm",
      "ui.choose",
      "ui.prompt",
      "ui.notify",
      "ui.openFile",
      "ui.saveFile",
      "bus.publish",
      "bus.subscribe",
      "bus.unsubscribe",
      "sys.theme.get",
      "sys.openExternal",
    ]);
    expect(trapLog()).toEqual([]);
    // R15: the host never publishes sys:policy
    expect(published).not.toContain("sys:policy");
  });

  it("gives the app its id, name, version, argv and pid", () => {
    const os = createOS(fakeDeps([]));
    expect([os.app.id, os.app.name, os.app.version]).toEqual([
      "fixture",
      "Fixture",
      "1.0",
    ]);
    expect([...os.argv]).toEqual(["--x"]);
    expect(os.pid).toBe(3);
  });

  it("throws a named error for proc.kill and sys.reboot", async () => {
    await expect(kill(createOS(fakeDeps([])))).rejects.toThrow("proc.kill");
    await expect(reboot(createOS(fakeDeps([])))).rejects.toThrow("sys.reboot");
  });

  it("throws and logs any other member, at every level", () => {
    const os = createOS(fakeDeps([]));
    const any = os as unknown as Record<string, Record<string, unknown>>;
    const win = os.ui.createWindow({ title: "w" }) as unknown as Record<
      string,
      unknown
    >;
    const touches: [() => unknown, string][] = [
      [() => os.fs.rm, "fs.rm"],
      [() => os.fs.watch, "fs.watch"],
      [() => os.proc.cwd, "proc.cwd"],
      [() => os.ui.highlight, "ui.highlight"],
      [() => os.sys.info, "sys.info"],
      [() => os.sys.theme.list, "sys.theme.list"],
      [() => os.sys.sound.play, "sys.sound.play"],
      [() => os.env.HOME, "env.HOME"],
      [() => (os.app as unknown as Record<string, unknown>).icon, "app.icon"],
      [() => any.nope, "nope"],
      [() => any.ui.nope, "ui.nope"],
      [() => win.minimize, "Window.minimize"],
    ];
    for (const [touch, member] of touches) {
      let err: unknown;
      try {
        touch();
      } catch (e) {
        err = e;
      }
      expect(err, member).toBeInstanceOf(HostMemberError);
      expect((err as Error).message).toContain(member);
      expect((err as HostMemberError).member).toBe(member);
    }
    // writes are traps too
    expect(() => {
      (any.proc as Record<string, unknown>).exit = () => {};
    }).toThrow("proc.exit");
    expect(trapLog()).toEqual([
      ...touches.map(([, member]) => ({ app: "fixture", member })),
      { app: "fixture", member: "proc.exit" },
    ]);
  });

  it("R14: sys.theme.set does nothing", async () => {
    const os = createOS(fakeDeps([]));
    await expect(os.sys.theme.set("night")).resolves.toBeUndefined();
    expect(os.sys.theme.get()).toBe("default");
    expect(trapLog()).toEqual([]);
  });

  it("records each app and member once", () => {
    const os = createOS(fakeDeps([]));
    for (let i = 0; i < 3; i++) expect(() => os.proc.kill).toThrow();
    expect(trapLog()).toEqual([{ app: "fixture", member: "proc.kill" }]);
  });

  it("does not break await, logging, JSON or string conversion", async () => {
    const os = createOS(fakeDeps([]));
    // an async function may return os: the runtime probes `then`
    const same = await (async () => os)();
    expect(same.pid).toBe(3);
    expect(await Promise.resolve(os.fs)).toBe(os.fs);
    expect(String(os.env)).toBe("[object Object]");
    expect(`${os.ui}`).toBe("[object Object]");
    expect(JSON.parse(JSON.stringify(os.env))).toEqual({
      DISPLAY: "sheet",
      DISPLAY_POLICY: "desktop",
    });
    expect(Object.keys(os.sys).sort()).toEqual([
      "openExternal",
      "sound",
      "theme",
    ]);
    expect({ ...os.app }).toEqual({
      id: "fixture",
      name: "Fixture",
      version: "1.0",
    });
    expect("kill" in os.proc).toBe(false);
    expect(trapLog()).toEqual([]);
  });
});

describe("R1 calls pass through the trap unchanged", () => {
  it("forwards arguments and return values across namespaces", async () => {
    const deps = fakeDeps([]);
    const bytes = new Uint8Array([1, 2]);
    const writeFile = vi.fn(async () => {});
    const spawn = vi.fn(async () => 9);
    const choose = vi.fn(async () => 2);
    const publish = vi.fn();
    const off = () => {};
    const subscribe = vi.fn(() => off);
    deps.fs.writeFile = writeFile;
    deps.fs.readFile = async () => bytes;
    deps.proc.spawn = spawn;
    deps.ui.choose = choose;
    deps.bus.publish = publish;
    deps.bus.subscribe = subscribe;
    deps.theme.get = () => "night";
    const os = createOS(deps);
    const cb = () => {};

    await os.fs.writeFile("/a", "x", { append: true });
    expect(writeFile).toHaveBeenCalledWith("/a", "x", { append: true });
    expect(await os.fs.readFile("/a")).toBe(bytes);
    expect(await os.proc.spawn("writer", ["--readonly", "/x.md"])).toBe(9);
    expect(spawn).toHaveBeenCalledWith("writer", ["--readonly", "/x.md"]);
    expect(await os.ui.choose("?", ["A", "B", "C"], "T")).toBe(2);
    expect(choose).toHaveBeenCalledWith("?", ["A", "B", "C"], "T");
    os.bus.publish("t", { n: 1 });
    expect(publish).toHaveBeenCalledWith("t", { n: 1 });
    expect(os.bus.subscribe("t", cb)).toBe(off);
    expect(subscribe).toHaveBeenCalledWith("t", cb);
    expect(os.sys.theme.get()).toBe("night");
  });

  it("keeps each method bound to its implementation object", async () => {
    class Fs {
      base = "/home/guest";
      resolve(p: string): string {
        return `${this.base}/${p}`;
      }
      async exists(p: string): Promise<boolean> {
        return this.resolve(p) === "/home/guest/a";
      }
    }
    const deps = fakeDeps([]);
    // a real instance: its methods read `this`
    deps.fs = Object.assign(new Fs(), deps.fs, {
      resolve: Fs.prototype.resolve,
      exists: Fs.prototype.exists,
    });
    const os = createOS(deps);
    const { resolve } = os.fs; // detached call still sees its receiver
    expect(resolve("x")).toBe("/home/guest/x");
    expect(await os.fs.exists("a")).toBe(true);
  });

  it("passes window options through and keeps root, id and binding", () => {
    const deps = fakeDeps([]);
    const root = document.createElement("div");
    const sizes: [number, number][] = [];
    const win = {
      id: 11,
      root,
      size: [0, 0],
      setTitle() {},
      setMenu() {},
      setSize(this: { size: number[] }, w: number, h: number) {
        this.size = [w, h];
        sizes.push([w, h]);
      },
      setPosition() {},
      focus() {},
      close() {},
      onClose() {},
      onResize() {},
      onFocus() {},
    };
    const createWindow = vi.fn(() => win as unknown as OSWindow);
    deps.ui.createWindow = createWindow;
    const opts = { title: "New Picture", width: 300, height: 200, modal: true };
    const w = createOS(deps).ui.createWindow(opts);
    expect(createWindow).toHaveBeenCalledWith(opts);
    expect(w.root).toBe(root);
    expect(w.id).toBe(11);
    const { setSize } = w;
    setSize(300, 200);
    expect(win.size).toEqual([300, 200]);
    expect(sizes).toEqual([[300, 200]]);
  });
});

describe("sys.openExternal default (no override)", () => {
  afterEach(() => vi.restoreAllMocks());

  function open(url: string) {
    const spy = vi.spyOn(window, "open").mockReturnValue(null);
    const deps = fakeDeps([]);
    delete deps.openExternal;
    createOS(deps).sys.openExternal(url);
    return spy;
  }

  it.each(["http://a.test/", "https://a.test/x", "mailto:me@a.test"])(
    "opens %s in a new tab without opener or referrer",
    (url) => {
      expect(open(url).mock.calls).toEqual([
        [url, "_blank", "noopener,noreferrer"],
      ]);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "file:///etc/passwd",
    "/relative",
    "a.test/x",
  ])("opens nothing for %s", (url) => {
    expect(open(url)).not.toHaveBeenCalled();
  });
});

describe("R15 env, scale and overlay (unit part)", () => {
  it("sets DISPLAY to sheet and DISPLAY_POLICY to desktop", () => {
    const os = createOS(fakeDeps([]));
    expect(os.env.DISPLAY).toBe("sheet");
    expect(os.env.DISPLAY_POLICY).toBe("desktop");
  });

  it("turns UI sound effects off", () => {
    expect(createOS(fakeDeps([])).sys.sound.enabled()).toBe(false);
  });

  it("scale() is 1 and overlayRoot() is the host root without #display", () => {
    document.body.replaceChildren();
    const root = document.createElement("div");
    document.body.append(root);
    expect(scale()).toBe(1);
    expect(overlayRoot()).toBe(document.body);
    setHostOverlayRoot(root);
    expect(overlayRoot()).toBe(root);
    setHostOverlayRoot(null);
    expect(overlayRoot()).toBe(document.body);
  });

  it("the old OS display wins when #display exists", () => {
    document.body.innerHTML =
      '<div id="display" data-scale="2"><div class="wm-overlay"></div></div>';
    const overlay = document.querySelector(".wm-overlay");
    setHostOverlayRoot(document.createElement("div"));
    expect(scale()).toBe(2);
    expect(overlayRoot()).toBe(overlay);
    setHostOverlayRoot(null);
    document.body.replaceChildren();
  });
});

// Type check: the host OS is the SDK interface, not a look-alike.
export const typed: (deps: HostDeps) => OS = createOS;
