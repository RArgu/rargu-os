// 002 R1, R15: one `OS` object per hosted app with exactly the members of spec
// 002 assumption 1. Touching any other member throws a HostMemberError that
// names it and records it in the trap log (T8 reads it to confirm the list).
// The implementations come in as `deps` (fs T2, windows and dialogs T3-T5,
// theme T6, bus and proc T7); this file only shapes and guards them.
import type { Manifest, OS, Window as OSWindow } from "../../sdk/os";

const FS = [
  "readText",
  "readFile",
  "writeFile",
  "readdir",
  "stat",
  "exists",
  "mkdir",
  "resolve",
] as const;
const PROC = ["spawn", "list", "onSignal"] as const;
const UI = [
  "createWindow",
  "alert",
  "confirm",
  "choose",
  "prompt",
  "notify",
  "openFile",
  "saveFile",
] as const;
const WINDOW = [
  "id",
  "root",
  "setTitle",
  "setMenu",
  "setSize",
  "setPosition",
  "focus",
  "close",
  "onClose",
  "onResize",
  "onFocus",
] as const;

type HostFs = Pick<OS["fs"], (typeof FS)[number]>;
type HostProc = Pick<OS["proc"], (typeof PROC)[number]>;
type HostUi = Pick<OS["ui"], (typeof UI)[number]>;

/** The subset of the SDK `OS` the host provides; anything else is trapped. */
interface HostOS {
  pid: OS["pid"];
  argv: OS["argv"];
  app: Pick<Manifest, "id" | "name" | "version">;
  env: OS["env"];
  fs: HostFs;
  proc: HostProc;
  ui: HostUi;
  bus: OS["bus"];
  sys: {
    theme: Pick<OS["sys"]["theme"], "get" | "set">;
    sound: Pick<OS["sys"]["sound"], "enabled">;
    openExternal: OS["sys"]["openExternal"];
  };
  log: OS["log"];
}

/** Implementations from later tasks (fs T2, windows T3-T5, theme T6, bus/proc T7). */
export interface HostDeps {
  pid: number;
  app: HostOS["app"];
  argv?: string[];
  fs: HostFs;
  proc: HostProc;
  ui: HostUi;
  bus: OS["bus"];
  theme: Pick<OS["sys"]["theme"], "get">;
  /** default: http(s) and mailto links in a new tab, as the old OS does */
  openExternal?: (url: string) => void;
  /** default: the browser console, tagged with the app id */
  log?: OS["log"];
}

/** A new object with only `keys` of `src`; functions stay bound to `src`. */
function pick<T extends object, K extends keyof T>(
  src: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    const v = src[k];
    out[k] = (typeof v === "function" ? v.bind(src) : v) as T[K];
  }
  return out;
}

export class HostMemberError extends Error {
  constructor(readonly member: string) {
    super(`OS member not available on the sheet host: ${member}`);
    this.name = "HostMemberError";
  }
}

export interface TrapHit {
  app: string;
  member: string;
}

const hits = new Map<string, TrapHit>();

/** Every unlisted member an app touched, once per app and member. */
export function trapLog(): TrapHit[] {
  return [...hits.values()];
}

export function resetTrapLog(): void {
  hits.clear();
}

// Probes that runtimes and tools make on any object: `await` and
// Promise.resolve read `then`, JSON.stringify reads `toJSON`. They read as
// absent and are not app use, so they neither throw nor log.
const PROBES = new Set(["then", "toJSON"]);

/**
 * A read-only view of `target` in which every other string key throws.
 * Symbols, probes and Object.prototype members (toString, valueOf...) pass
 * through so string conversion, inspection and `await` keep working.
 */
function guard<T extends object>(appId: string, path: string, target: T): T {
  const name = (key: string): string => (path ? `${path}.${key}` : key);
  const fail = (key: string): never => {
    const member = name(key);
    hits.set(`${appId}\n${member}`, { app: appId, member });
    throw new HostMemberError(member);
  };
  return new Proxy(target, {
    get(t, key, recv) {
      if (typeof key === "symbol" || Object.hasOwn(t, key)) {
        return Reflect.get(t, key, recv);
      }
      if (PROBES.has(key)) return undefined;
      if (key in Object.prototype) return Reflect.get(t, key, recv);
      return fail(key);
    },
    set: (_t, key) => fail(String(key)),
    defineProperty: (_t, key) => fail(String(key)),
    deleteProperty: (_t, key) => fail(String(key)),
  });
}

/** R9: the bus all hosted apps share. */
export interface HostBus {
  /** The `os.bus` of the app with `pid` (0: the host). */
  forPid(pid: number): OS["bus"];
  /** R10: removes every subscription of the app with `pid`; later
   * subscriptions of that pid do nothing (its start has ended). */
  drop(pid: number): void;
}

/** Every subscriber of a topic hears a message with the sender's pid; one
 * that throws does not stop the others (as the old kernel's bus). */
export function createBus(): HostBus {
  const subs = new Set<{
    pid: number;
    topic: string;
    cb: (data: unknown, from: number) => void;
  }>();
  const retired = new Set<number>();
  return {
    forPid: (pid) => ({
      publish(topic, data) {
        for (const s of [...subs])
          if (s.topic === topic && subs.has(s))
            try {
              s.cb(data, pid);
            } catch (err) {
              console.warn(`bus "${topic}":`, err);
            }
      },
      subscribe(topic, cb) {
        if (retired.has(pid)) return () => {};
        const s = { pid, topic, cb };
        subs.add(s);
        return () => void subs.delete(s);
      },
    }),
    drop(pid) {
      if (pid) retired.add(pid);
      for (const s of [...subs]) if (s.pid === pid) subs.delete(s);
    },
  };
}

function openExternal(url: string): void {
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

// R15: the policy is fixed on the sheet. Test builds: `?policy=compact`
// gives the apps their phone layout (004 R8, Paint's phone toolbar).
const POLICY =
  import.meta.env.MODE === "e2e" &&
  new URLSearchParams(location.search).get("policy") === "compact"
    ? "compact"
    : "desktop";

/** Builds the `OS` object one hosted app's `main(os)` receives. */
export function createOS(deps: HostDeps): OS {
  const id = deps.app.id;
  const g = <T extends object>(path: string, target: T): T =>
    guard(id, path, target);
  const ui = pick(deps.ui, UI);
  const os: HostOS = {
    pid: deps.pid,
    argv: [...(deps.argv ?? [])],
    app: g("app", pick(deps.app, ["id", "name", "version"])),
    // R15: sheet marker; the policy is fixed, so sys:policy is never published
    env: g("env", { DISPLAY: "sheet", DISPLAY_POLICY: POLICY }),
    fs: g("fs", pick(deps.fs, FS)),
    proc: g("proc", pick(deps.proc, PROC)),
    ui: g("ui", {
      ...ui,
      createWindow: (opts) =>
        g("Window", pick(ui.createWindow(opts), WINDOW)) as OSWindow,
    }),
    bus: g("bus", pick(deps.bus, ["publish", "subscribe"])),
    sys: g("sys", {
      // R14: the theme follows the colour scheme; set does nothing
      theme: g("sys.theme", {
        ...pick(deps.theme, ["get"]),
        set: () => Promise.resolve(),
      }),
      // R17: UI sound effects are off on the sheet
      sound: g("sys.sound", { enabled: () => false }),
      openExternal: deps.openExternal ?? openExternal,
    }),
    log: deps.log ?? ((level, ...args) => console[level](`[${id}]`, ...args)),
  };
  return g("", os) as unknown as OS;
}
