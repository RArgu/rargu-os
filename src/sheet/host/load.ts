// 002 R11, R12: the app host's registry and start rule. Each hosted app is a
// lazy `import()` of its main module, registered here and nowhere else (001
// R2.b lets src/apps/ modules into /next only through these imports). One
// shared start promise per window: one import, one main() call. A start in
// the background keeps the app's root inert until main() settles, so the app
// can neither take the focus nor scroll the view (R11); the demo area stays
// the visitor's start control meanwhile. A failed start shows the error and
// "Try again", which cleans up (termination handlers, subscriptions, DOM),
// loads again what failed to load, and starts once (R12).
//
// Child windows and dialogs are modal panels, the menu row and shortcuts are
// in the app's window (T4, T5, window.ts). Styles, theme and motion:
// styles.ts (T6). Icons and the download link: T8.
//
// R9, R10 (T7): the bus (os.ts), proc.list and proc.spawn, and close: a
// closed app ends once and its window shows the start control again, which
// only the visitor (or a spawn) starts; the start rule does not.
import type { OS, ProcInfo } from "../../sdk/os";
import APP_URLS from "virtual:app-urls";
import { setHostOverlayRoot } from "../../ui/dom";
import { LAYOUT } from "../layout";
import { showFailure } from "./failure";
import { MemoryFs, downloadLink } from "./fs";
import { createBus, createOS, trapLog } from "./os";
import { installIcons } from "./resources";
import { failedCss, reloadCss } from "./css-retry";
import { startStyles } from "./styles";
import {
  createMainWindow,
  createPanels,
  showDownload,
  takeFocus,
  withoutScroll,
  type MainWindow,
  type Panels,
} from "./window";

type Main = (os: OS) => unknown;
type Loader = () => Promise<{ default: Main }>;

/** 002 R11: hosted app id → its lazy main module. */
const APPS: Record<string, Loader> = {
  castlesiege: () => import("../../apps/castlesiege/main.ts"),
  paint: () => import("../../apps/paint/main.ts"),
  tracker: () => import("../../apps/tracker/main.ts"),
  writer: () => import("../../apps/writer/main.ts"),
};
// Fixture apps, in test builds only (`vite build --mode e2e`): the production
// build drops this branch, and vite.config.ts fails a production build that
// still holds a tests/ module.
if (import.meta.env.MODE === "e2e")
  for (const [path, load] of Object.entries(
    import.meta.glob<{ default: Main }>(
      "../../../tests/fixtures/host/apps/*/main.ts",
    ),
  ))
    APPS[/apps\/([^/]+)\/main\.ts$/.exec(path)![1]] = load;

/** Test builds: main() calls per app id (002 R11.a counts them). */
const countMain = (id: string): void => {
  if (import.meta.env.MODE !== "e2e") return;
  const w = window as unknown as { __hostMain?: Record<string, number> };
  w.__hostMain ??= {};
  w.__hostMain[id] = (w.__hostMain[id] ?? 0) + 1;
};

interface Run {
  winId: string;
  appId: string;
  el: HTMLElement;
  area: HTMLElement;
  pid: number;
  /** the pid of the start attempt that may still act (0: none). An ended
   * attempt's OS and windows do nothing to a later one (R10). */
  live: number;
  /** the app's name, from its manifest */
  name: string;
  /** the argv of the next start (proc.spawn), else none */
  argv: string[];
  startedAt: number;
  state: "idle" | "starting" | "running" | "failed" | "closed";
  start: Promise<void> | null;
  /** started by the start rule, not by the visitor; cleared on activation */
  bg: boolean;
  main: MainWindow | null;
  /** this attempt's child windows and dialogs (R3, R4) */
  panels: Panels | null;
  /** ends this attempt's file calls (R10) */
  abort(): void;
  /** this attempt's termination handlers (os.proc.onSignal) */
  signals: ((sig: "terminate") => void | Promise<void>)[];
  /** the last attempt's import rejected (and not for a stylesheet) */
  importFailed: boolean;
  tries: number;
}

export interface HostDeps {
  /** sheet window id → hosted app id */
  hosted: Record<string, string>;
  /** brings a sheet window to the front (001 R7.a) */
  front(el: HTMLElement): void;
  /** R9: moves the view to a sheet window (001 panTo) and brings it to the
   * front; `focus`: the focus goes to it, as in card navigation (001 R12) */
  show(winId: string, focus: boolean): void;
}

export interface Host {
  /** R11: starts the window's app, once. `background`: by the start rule. */
  start(winId: string, background: boolean): Promise<void>;
  /** 004 R11: makes the window's running app the active app (it may take
   * the focus, without scrolling), as a press in it does. */
  activate(winId: string): void;
}

export function createHost(deps: HostDeps): Host {
  const hosted = { ...deps.hosted };
  if (import.meta.env.MODE === "e2e")
    // `?host=notes:fx-size,paint:fx-throw` runs fixtures in those windows
    for (const pair of (new URLSearchParams(location.search).get("host") ?? "")
      .split(",")
      .filter(Boolean)) {
      const [win, app] = pair.split(":");
      if (win in hosted && app in APPS) hosted[win] = app;
    }

  const mem = new MemoryFs();
  // R8: icons from the resource table, before any app starts
  installIcons();
  // test builds: the member trap's log (assumption 1), the memory fs, and
  // (003 review) a window's app closed as its own win.close() does,
  // proc.list and (004 R11) the active app's window; no visible control
  if (import.meta.env.MODE === "e2e")
    Object.assign(window, {
      __host: {
        trapLog,
        fs: mem.vfs,
        close: (winId: string) => {
          const run = runs.get(winId);
          if (run) end(run);
        },
        list: () => list(),
        active: () => active?.winId ?? null,
      },
    });
  let nextPid = 1;
  const runs = new Map<string, Run>();
  for (const [winId, appId] of Object.entries(hosted)) {
    const el = document.querySelector<HTMLElement>(`[data-win="${winId}"]`)!;
    runs.set(winId, {
      winId,
      appId,
      el,
      area: el.querySelector<HTMLElement>(".demo-area")!,
      pid: 0,
      live: 0,
      name: appId,
      argv: [],
      startedAt: 0,
      state: "idle",
      start: null,
      bg: false,
      main: null,
      panels: null,
      abort() {},
      signals: [],
      importFailed: false,
      tries: 0,
    });
  }

  // the active app owns the keyboard; menus open in its host root
  let active: Run | null = null;
  const setActive = (run: Run | null): void => {
    if (run && !run.main) run = null;
    if (run === active) return;
    active?.main?.focused(false);
    active = run;
    setHostOverlayRoot(overlayOf(run));
    run?.main?.focused(true);
  };
  // menus open in the app's top panel, else in its root (R3, R15)
  const overlayOf = (run: Run | null): HTMLElement | null =>
    run?.panels?.top() ?? run?.main?.root ?? null;
  // the app is active while the focus is in its demo area (its root or its
  // panels); the window frame and its title bar are the sheet's (001 R19 Tab
  // stops), not the app's
  document.addEventListener("focusin", (e) => {
    const run = [...runs.values()].find(
      (r) => r.main && r.area.contains(e.target as Node),
    );
    setActive(run?.state === "running" && run.live ? run : null);
  });

  // R9: one bus for all apps, delivery with the sender's pid
  const bus = createBus();
  // R14, R16: theme and motion before any app starts; a scheme change
  // publishes sys:theme (from pid 0, the host)
  const styles = startStyles((name) =>
    bus.forPid(0).publish("sys:theme", { name }),
  );

  const list = (): ProcInfo[] =>
    [...runs.values()]
      .filter((r) => r.state === "running")
      .map((r) => ({
        pid: r.pid,
        appId: r.appId,
        name: r.name,
        argv: [...r.argv],
        startedAt: r.startedAt,
        windows: r.main ? 1 : 0,
        state: "running",
      }));

  async function manifest(appId: string) {
    try {
      const m = JSON.parse(
        await mem.vfs.readText(`/apps/${appId}/manifest.json`),
      ) as { name?: string; version?: string };
      return { id: appId, name: m.name ?? appId, version: m.version };
    } catch {
      return { id: appId, name: appId, version: "0" };
    }
  }

  function osFor(run: Run, app: OS["app"]): OS {
    // R10: this attempt's calls act only while it is the live one
    const pid = run.pid;
    const live = () => run.live === pid;
    const ended = () => new Error(`${run.appId}: this start has ended`);
    const panels = (run.panels = createPanels({
      el: run.el,
      area: run.area,
      appName: app.name,
      blocked: (on) => run.main?.block("modal", on),
      changed: () => {
        if (active === run) setHostOverlayRoot(overlayOf(run));
      },
      // R11: a child or dialog opened in a background start waits inert
      background: () => run.bg && run.state === "starting",
    }));
    const life = new AbortController();
    run.abort = () => life.abort();
    const files = mem.forApp({
      signal: life.signal,
      // saveFile asks for the name with the host's prompt (R6, R4)
      askName: (name) =>
        live()
          ? panels.prompt("File name:", name, "Save As")
          : Promise.resolve(null),
      // R6: the window shows the latest write's "Download <name>" link
      onDownloadOffered: (offer) => {
        if (live()) showDownload(run.area, downloadLink(offer));
      },
      // an import that failed (too large): a host alert in the window
      onError: (msg) => void (live() && panels.alert(msg)),
    });
    return createOS({
      pid: run.pid,
      app,
      argv: run.argv,
      fs: files.fs,
      proc: {
        spawn: (target, argv) =>
          live() ? spawn(run, target, argv) : Promise.reject(ended()),
        list,
        // run once when the app ends or its start fails (R10, R12)
        onSignal: (cb) => void (live() && run.signals.push(cb)),
      },
      ui: {
        createWindow(opts) {
          if (!live()) throw ended();
          // R3: every later window is a modal panel in the main one
          if (run.main) return panels.child(opts);
          run.main = createMainWindow(opts, {
            el: run.el,
            area: run.area,
            max: {
              w: run.area.clientWidth,
              h: LAYOUT.find((s) => s.id === run.winId)!.demoH,
            },
            front: () => deps.front(run.el),
            onActive: () => setActive(run),
            background: () => run.bg && run.state === "starting",
            close: () => void (live() && end(run)),
          });
          if (panels.top()) run.main.block("modal", true);
          // an ended attempt's window calls do nothing
          const win = run.main.win;
          return Object.fromEntries(
            Object.entries(win).map(([k, v]) => [
              k,
              typeof v === "function"
                ? (...a: unknown[]) => (live() ? v.apply(win, a) : undefined)
                : v,
            ]),
          ) as typeof win;
        },
        // an ended attempt's dialogs settle at once with their cancel values
        alert: (...a) => (live() ? panels.alert(...a) : Promise.resolve()),
        confirm: (...a) =>
          live() ? panels.confirm(...a) : Promise.resolve(false),
        choose: (m, b, t) =>
          live()
            ? panels.choose(m, b, t)
            : Promise.resolve(Math.max(0, b.length - 1)),
        prompt: (...a) =>
          live() ? panels.prompt(...a) : Promise.resolve(null),
        notify: (msg) => console.info(`[${run.appId}]`, msg),
        openFile: files.openFile,
        saveFile: files.saveFile,
      },
      bus: bus.forPid(run.pid),
      theme: styles,
    });
  }

  /** R10, R12: the attempt's termination handlers run once (each one's error
   * kept to itself), then its subscriptions, dialogs, focus and window go. */
  function cleanup(run: Run): void {
    // the attempt is over before any of its handlers runs
    run.live = 0;
    run.abort();
    // a step that throws (an app callback) does not stop the others
    const safe = (step: string, fn: () => void): void => {
      try {
        fn();
      } catch (err) {
        console.warn(`[${run.appId}] ${step}:`, err);
      }
    };
    for (const cb of run.signals.splice(0))
      try {
        void Promise.resolve(cb("terminate")).catch((err) =>
          console.warn(`[${run.appId}] termination handler:`, err),
        );
      } catch (err) {
        console.warn(`[${run.appId}] termination handler:`, err);
      }
    bus.drop(run.pid);
    // the app hears its focus loss first: the panels' focus moves below
    // reach no ended app
    if (active === run)
      safe("focus", () => {
        try {
          setActive(null);
        } finally {
          // a throwing onFocus has left the app half active
          active = null;
          setHostOverlayRoot(null);
        }
      });
    // open dialogs settle with their cancel values (R10)
    safe("closing panels", () => run.panels?.closeAll());
    run.panels = null;
    safe("window", () => run.main?.dispose());
    run.main = null;
    run.area.replaceChildren();
  }

  /** R10: a closed app ends once; its window shows the start control
   * again (as main.ts made it), which the start rule does not press. */
  function end(run: Run): void {
    if (run.state !== "running" && run.state !== "starting") return;
    const had = run.area.contains(document.activeElement);
    cleanup(run);
    run.state = "closed";
    run.start = null;
    run.bg = false;
    run.argv = [];
    run.area.dataset.host = "closed";
    run.area.tabIndex = 0;
    run.area.setAttribute("role", "button");
    run.area.setAttribute(
      "aria-label",
      `Start ${run.el.getAttribute("aria-label")}`,
    );
    // the focus stays in the window, on its start control
    if (had) run.area.focus({ preventScroll: true });
  }

  /** R9: starts a hosted app if needed (with `argv` on its first start),
   * moves the view to its window and resolves its pid. An app in a
   * background start moves neither the view nor the focus (R11). */
  async function spawn(
    caller: Run,
    target: string,
    argv: string[] = [],
  ): Promise<number> {
    const run = [...runs.values()].find((r) => r.appId === target);
    if (!run) throw new Error(`proc.spawn: ${target} is not on the sheet`);
    const visitor = !(caller.bg && caller.state === "starting");
    if (run.state === "idle" || run.state === "closed") run.argv = [...argv];
    if (visitor) deps.show(run.winId, run !== caller);
    // an app that spawns itself while it starts: its own pid (awaiting its
    // own start would never end)
    if (run === caller && run.state === "starting") return run.pid;
    await host.start(run.winId, !visitor);
    if (run.state !== "running")
      throw new Error(`proc.spawn: ${target} did not start`);
    return run.pid;
  }

  function fail(run: Run, err: unknown): void {
    cleanup(run);
    run.state = "failed";
    // a warning: the window shows the error
    console.warn(`[${run.appId}] start failed:`, err);
    showFailure(run.area, err, () => {
      cleanup(run);
      run.state = "idle";
      run.start = null;
      void host.start(run.winId, false);
    });
  }

  /** The app's module; after a failed load, a fresh URL for it (R12). */
  async function load(run: Run) {
    const url = APP_URLS[run.appId];
    if (run.importFailed && url)
      return (await import(/* @vite-ignore */ `${url}?retry=${run.tries}`)) as {
        default: Main;
      };
    return APPS[run.appId]();
  }

  async function launch(run: Run): Promise<void> {
    run.state = "starting";
    // an earlier attempt's waiting focus is not this one's (004 R11)
    takeFocus(run.el);
    run.area.dataset.host = "starting";
    // a window the host itself failed in still shows that error (main.ts)
    run.area.replaceChildren();
    let mod: { default: Main };
    let css = 0;
    try {
      if (run.tries > 0) await reloadCss(run.tries);
      css = failedCss.size;
      mod = await load(run);
    } catch (err) {
      // a stylesheet's failure loads the stylesheet again, not the module
      run.importFailed = failedCss.size === css;
      run.tries++;
      return fail(run, err);
    }
    run.importFailed = false;
    run.tries++;
    const pid = (run.pid = run.live = nextPid++);
    // the app ended (closed) during main(): this attempt is over
    const stale = () => run.live !== pid || run.state !== "starting";
    try {
      run.startedAt = Date.now();
      const app = await manifest(run.appId);
      run.name = app.name;
      const os = osFor(run, app);
      countMain(run.appId);
      await mod.default(os);
      if (stale()) return;
      run.state = "running";
      run.area.dataset.host = "running";
      // the start control is done; a focus on it stays in the window
      if (document.activeElement === run.area)
        run.el.focus({ preventScroll: true });
      for (const a of ["role", "tabindex", "aria-label"])
        run.area.removeAttribute(a);
      run.main?.block("bg", false);
      run.panels?.release();
      // R2: an app that focused its content in main() is the active app
      if (run.main?.root.contains(document.activeElement)) setActive(run);
    } catch (err) {
      if (stale()) console.warn(`[${run.appId}] after close:`, err);
      else fail(run, err);
    }
  }

  const host: Host = {
    start(winId, background) {
      const run = runs.get(winId);
      if (!run) return Promise.resolve();
      // R10: a closed app starts again only when the visitor activates it
      if (run.state === "closed") {
        if (background) return Promise.resolve();
        run.state = "idle";
      }
      // an activation during a background start lets the app take the focus
      if (!background && run.bg) {
        run.bg = false;
        run.main?.block("bg", false);
        run.panels?.release();
      }
      // a failed start waits for Try again
      if (run.start || run.state === "failed")
        return run.start ?? Promise.resolve();
      run.bg = background;
      return (run.start = launch(run));
    },
    activate(winId) {
      const run = runs.get(winId);
      if (run?.state !== "running" || !run.live || run.bg) return;
      withoutScroll(() => {
        // the focus the app took in main() lands now (R2)
        const el = takeFocus(run.el);
        if (el?.isConnected && run.area.contains(el)) el.focus();
        setActive(run);
      });
    },
  };
  return host;
}
