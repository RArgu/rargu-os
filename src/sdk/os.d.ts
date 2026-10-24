// RArgu OS app API. This file is the whole interface between a program
// and the OS. Apps import types only from here.

export interface DirEntry {
  name: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

export interface Stat {
  type: "file" | "dir";
  size: number;
  mtime: number;
  mode: string;
  readonly: boolean;
  /** "system" = bundled image only, "modified" = in the visitor's overlay, "virtual" = /proc and /dev */
  layer: "system" | "modified" | "virtual";
}

export interface FsEvent {
  type: "create" | "modify" | "delete";
  path: string;
}

export interface ProcInfo {
  pid: number;
  appId: string;
  name: string;
  argv: string[];
  startedAt: number;
  windows: number;
  state: "running" | "exiting";
}

export interface SysInfo {
  version: string;
  buildDate: string;
  uptime: number;
  hostname: string;
  displayPolicy: "desktop" | "compact";
  scale: number;
  storageUsedBytes: number;
}

export type ThemeName = string;
export type SoundName =
  "click" | "open" | "close" | "error" | "notify" | "startup";

export interface Manifest {
  id: string;
  name: string;
  shortName?: string;
  version?: string;
  icon?: string;
  entry?: string;
  window?: {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    resizable?: boolean;
  };
  singleton?: boolean;
  exitOnLastWindowClose?: boolean;
  opens?: string[];
  category?: string;
  hidden?: boolean;
}

export interface OS {
  readonly pid: number;
  readonly argv: string[];
  readonly app: Manifest;
  readonly env: Readonly<Record<string, string>>;

  fs: {
    readFile(path: string): Promise<Uint8Array>;
    readText(path: string): Promise<string>;
    writeFile(
      path: string,
      data: Uint8Array | string,
      opts?: { append?: boolean },
    ): Promise<void>;
    readdir(path: string): Promise<DirEntry[]>;
    stat(path: string): Promise<Stat>;
    mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
    rm(path: string, opts?: { recursive?: boolean }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    watch(path: string, cb: (ev: FsEvent) => void): () => void;
    resolve(path: string): string;
  };

  proc: {
    spawn(target: string, argv?: string[]): Promise<number>;
    kill(pid: number): Promise<void>;
    exit(code?: number): void;
    list(): ProcInfo[];
    onSignal(cb: (sig: "terminate") => void | Promise<void>): void;
    cwd: string;
  };

  ui: {
    createWindow(opts: WindowOptions): Window;
    alert(message: string, title?: string): Promise<void>;
    confirm(message: string, title?: string): Promise<boolean>;
    /** Buttons left to right; resolves with the index pressed. Esc or closing gives the last one. */
    choose(message: string, buttons: string[], title?: string): Promise<number>;
    prompt(
      message: string,
      defaultValue?: string,
      title?: string,
    ): Promise<string | null>;
    openFile(opts?: {
      filters?: string[];
      startDir?: string;
    }): Promise<string | null>;
    saveFile(opts?: {
      filters?: string[];
      startDir?: string;
      defaultName?: string;
    }): Promise<string | null>;
    notify(message: string): void;
    /**
     * Dashed pulsing outline over "group:<Name>" | "app:<id>" | "taskbar" |
     * "window:<appId>" | "control:<appId>/<name>" (the element with
     * data-guide="<name>" in that app's most recently focused visible window).
     * ms defaults to 2000; ms = 0 keeps the outline, following its target, until
     * the next highlight call or highlight("none"). Unknown targets are ignored.
     */
    highlight(target: string, ms?: number): void;
    /**
     * Moves and sizes that app's most recent window into a slot of the stage
     * (the display minus the taskbar and the Guide's strip). Honored only for
     * app id "guide", desktop policy only; ignored otherwise.
     */
    place(appId: string, slot: "main" | "side" | "center"): void;
  };

  bus: {
    publish(topic: string, data?: unknown): void;
    subscribe(
      topic: string,
      cb: (data: unknown, from: number) => void,
    ): () => void;
  };

  sys: {
    info(): SysInfo;
    theme: {
      get(): ThemeName;
      set(name: ThemeName): Promise<void>;
      list(): ThemeName[];
    };
    sound: {
      play(name: SoundName): void;
      enabled(): boolean;
      setEnabled(v: boolean): Promise<void>;
    };
    reboot(): void;
    openExternal(url: string): void;
  };

  log(level: "info" | "warn" | "error", ...args: unknown[]): void;
}

export interface Window {
  readonly id: number;
  readonly root: HTMLElement;
  setTitle(t: string): void;
  setMenu(menu: MenuSpec | null): void;
  setSize(w: number, h: number): void;
  setPosition(x: number, y: number): void;
  focus(): void;
  close(): void;
  onClose(cb: () => boolean | void): void;
  onResize(cb: (w: number, h: number) => void): void;
  onFocus(cb: (focused: boolean) => void): void;
}

export interface WindowOptions {
  title: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  x?: number;
  y?: number;
  modal?: boolean;
  largeTitle?: boolean;
  frameless?: boolean;
}

export interface MenuSpec {
  items: MenuItem[];
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  action?: () => void;
  children?: MenuItem[];
  separator?: boolean;
}
