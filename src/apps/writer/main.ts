// Writer: a plain text editor (Notes on the sheet).
import "./styles.css";
import type { OS } from "../../sdk/os";
import { h } from "../../ui/dom";
import { button } from "../../ui/widgets";
import {
  appName,
  baseOf,
  dirOf,
  errorMessage,
  helpMenu,
  loadConfig,
  saveConfig,
  askToSave,
} from "../lib/open";

const MAX_BYTES = 1024 * 1024;
const FILTERS = [".md", ".txt", ".json", ".js", ".trk", ".log"];

interface Config {
  wrap: boolean;
  zoom: 1 | 2;
}

export default async function main(os: OS): Promise<void> {
  const readonly = os.argv.includes("--readonly");
  const startPath = os.argv.find((a) => !a.startsWith("--")) ?? null;
  const config = await loadConfig<Config>(os, { wrap: true, zoom: 1 });

  let path: string | null = null;
  let saved = "";
  let forceClose = false;

  const win = os.ui.createWindow({ title: "Writer" });
  const area = h("textarea", {
    attrs: {
      spellcheck: "false",
      "aria-label": "Text",
      autocapitalize: "off",
      autocomplete: "off",
    },
    data: { tabs: "insert" },
  });
  area.readOnly = readonly;
  const banner = readonly
    ? h("div", {
        class: "writer-banner",
        text: "Read-only. Use File > Save As to keep an editable copy.",
      })
    : null;
  const status = { pos: h("span"), chars: h("span"), mod: h("span") };
  const statusBar = h(
    "div",
    { class: "statusbar" },
    status.pos,
    status.chars,
    status.mod,
  );

  // find / replace bar
  const findInput = h("input", {
    attrs: { type: "text", placeholder: "Find", "aria-label": "Find" },
  });
  const replaceInput = h("input", {
    attrs: {
      type: "text",
      placeholder: "Replace with",
      "aria-label": "Replace with",
    },
  });
  const replaceRow = [
    replaceInput,
    button("Replace", () => replaceOne(), { class: "small" }),
    button("All", () => replaceAll(), { class: "small" }),
  ];
  const findBar = h(
    "div",
    { class: "writer-find hidden" },
    findInput,
    button("Next", () => find(1), { class: "small" }),
    button("Prev", () => find(-1), { class: "small" }),
    ...replaceRow,
    button("×", () => closeFind(), { class: "small", tip: "Close" }),
  );

  win.root.append(
    h("div", { class: "app writer" }, banner, area, findBar, statusBar),
  );

  const modified = (): boolean => !readonly && area.value !== saved;

  function refresh(): void {
    const before = area.value.slice(0, area.selectionStart);
    const line = before.split("\n").length;
    const col = before.length - before.lastIndexOf("\n");
    status.pos.textContent = `Ln ${line}, Col ${col}`;
    status.chars.textContent = `${area.value.length} chars`;
    status.mod.textContent = readonly
      ? "read-only"
      : modified()
        ? "modified"
        : "";
    const name = path ? baseOf(path) : "untitled";
    const title = `${appName(os, "Writer")} - ${name}${modified() ? " *" : ""}`;
    if (title !== lastTitle) {
      lastTitle = title;
      win.setTitle(title);
    }
  }
  let lastTitle = "";

  function applyView(): void {
    area.classList.toggle("nowrap", !config.wrap);
    area.wrap = config.wrap ? "soft" : "off";
    area.style.setProperty("--writer-zoom", String(config.zoom));
    buildMenu();
  }

  async function confirmDiscard(): Promise<boolean> {
    if (!modified()) return true;
    return askToSave(os, "Save your changes first?", "Writer", save);
  }

  async function load(file: string): Promise<void> {
    try {
      const st = await os.fs.stat(file);
      if (st.type === "dir") throw new Error(`${file} is a folder`);
      if (st.size > MAX_BYTES)
        throw new Error("Writer opens files up to 1 MB.");
      const text = await os.fs.readText(file);
      path = os.fs.resolve(file);
      area.value = text;
      saved = text;
      area.setSelectionRange(0, 0);
      area.scrollTop = 0;
    } catch (err) {
      await os.ui.alert(
        `Could not open ${file}:\n${errorMessage(err)}`,
        "Writer",
      );
    }
    refresh();
  }

  async function write(file: string): Promise<boolean> {
    try {
      if (new TextEncoder().encode(area.value).length > MAX_BYTES) {
        throw new Error("Writer saves files up to 1 MB.");
      }
      await os.fs.writeFile(file, area.value);
      path = os.fs.resolve(file);
      if (!readonly) saved = area.value;
      refresh();
      return true;
    } catch (err) {
      await os.ui.alert(
        `Could not save ${file}:\n${errorMessage(err)}`,
        "Writer",
      );
      return false;
    }
  }

  async function saveAs(): Promise<boolean> {
    const target = await os.ui.saveFile({
      filters: FILTERS,
      startDir: path ? dirOf(path) : "~/Documents",
      defaultName: path ? baseOf(path) : "untitled.txt",
    });
    return target ? write(target) : false;
  }

  async function save(): Promise<boolean> {
    if (readonly || !path) return saveAs();
    return write(path);
  }

  async function open(): Promise<void> {
    if (!(await confirmDiscard())) return;
    const file = await os.ui.openFile({
      filters: FILTERS,
      startDir: path ? dirOf(path) : "~/Documents",
    });
    if (file) await load(file);
  }

  async function newFile(): Promise<void> {
    if (readonly) return void os.proc.spawn("writer").catch(() => {});
    if (!(await confirmDiscard())) return;
    path = null;
    area.value = "";
    saved = "";
    refresh();
  }

  // ----- find and replace -----

  function openFind(withReplace: boolean): void {
    findBar.classList.remove("hidden");
    for (const el of replaceRow)
      el.classList.toggle("hidden", !withReplace || readonly);
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    if (sel && !sel.includes("\n")) findInput.value = sel;
    findInput.focus();
    findInput.select();
  }

  function closeFind(): void {
    findBar.classList.add("hidden");
    area.focus();
  }

  function find(dir: 1 | -1): boolean {
    const needle = findInput.value;
    if (!needle) return false;
    const hay = area.value.toLowerCase();
    const n = needle.toLowerCase();
    let at =
      dir > 0
        ? hay.indexOf(n, area.selectionEnd)
        : hay.lastIndexOf(n, area.selectionStart - 1);
    if (at < 0) at = dir > 0 ? hay.indexOf(n) : hay.lastIndexOf(n);
    if (at < 0) {
      os.ui.notify(`"${needle}" not found`);
      return false;
    }
    area.focus();
    area.setSelectionRange(at, at + needle.length);
    refresh();
    return true;
  }

  function insert(text: string): void {
    area.focus();
    // execCommand keeps the native undo stack; fall back to setRangeText
    if (!document.execCommand("insertText", false, text)) {
      area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
    }
    refresh();
  }

  function replaceOne(): void {
    const needle = findInput.value;
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    if (needle && sel.toLowerCase() === needle.toLowerCase())
      insert(replaceInput.value);
    find(1);
  }

  function replaceAll(): void {
    const needle = findInput.value;
    if (!needle) return;
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const count = area.value.match(re)?.length ?? 0;
    if (count === 0) return void os.ui.notify(`"${needle}" not found`);
    area.select();
    insert(area.value.replace(re, () => replaceInput.value));
    os.ui.notify(`Replaced ${count} occurrence${count === 1 ? "" : "s"}`);
  }

  async function paste(): Promise<void> {
    try {
      insert(await navigator.clipboard.readText());
    } catch {
      os.ui.notify(
        "Paste with Ctrl+V: the browser did not allow clipboard access.",
      );
    }
  }

  // ----- menu -----

  function buildMenu(): void {
    const edit = (cmd: string) => () => {
      area.focus();
      document.execCommand(cmd);
      refresh();
    };
    win.setMenu({
      items: [
        {
          label: "File",
          children: [
            { label: "New", action: () => void newFile() },
            { label: "Open…", shortcut: "Ctrl+O", action: () => void open() },
            {
              label: "Save",
              shortcut: "Ctrl+S",
              disabled: readonly,
              action: () => void save(),
            },
            { label: "Save As…", action: () => void saveAs() },
            { label: "", separator: true },
            { label: "Close", action: () => win.close() },
          ],
        },
        {
          label: "Edit",
          children: [
            {
              label: "Undo",
              shortcut: "Ctrl+Z",
              disabled: readonly,
              action: edit("undo"),
            },
            {
              label: "Redo",
              shortcut: "Ctrl+Y",
              disabled: readonly,
              action: edit("redo"),
            },
            { label: "", separator: true },
            {
              label: "Cut",
              shortcut: "Ctrl+X",
              disabled: readonly,
              action: edit("cut"),
            },
            { label: "Copy", shortcut: "Ctrl+C", action: edit("copy") },
            {
              label: "Paste",
              shortcut: "Ctrl+V",
              disabled: readonly,
              action: () => void paste(),
            },
            { label: "", separator: true },
            {
              label: "Find…",
              shortcut: "Ctrl+F",
              action: () => openFind(false),
            },
            {
              label: "Replace…",
              shortcut: "Ctrl+H",
              disabled: readonly,
              action: () => openFind(true),
            },
            {
              label: "Select All",
              shortcut: "Ctrl+A",
              action: () => area.select(),
            },
          ],
        },
        {
          label: "View",
          children: [
            {
              label: "Word wrap",
              checked: config.wrap,
              action: () => {
                config.wrap = !config.wrap;
                applyView();
                void saveConfig(os, config);
              },
            },
            {
              label: "Font size",
              children: ([1, 2] as const).map((z) => ({
                label: `${z}x`,
                checked: config.zoom === z,
                action: () => {
                  config.zoom = z;
                  applyView();
                  void saveConfig(os, config);
                },
              })),
            },
          ],
        },
        helpMenu(os),
      ],
    });
  }

  // ----- events -----

  area.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab" && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
      ev.preventDefault();
      if (!readonly) insert("  ");
    } else if (ev.key === "Escape" && !ev.isComposing) {
      leaveText(ev);
    }
  });

  // spec 004 R10: on the sheet, Escape alone moves the focus from the text
  // to the window region (the sheet's [data-win] Tab stop). The next Tab
  // goes on to the sheet's next stop, past this window's own controls (they
  // are inert for that one key); Shift+Tab from the region already leaves.
  // The Escape is taken (preventDefault), so the host's Esc-then-Tab route
  // (sheet/host/window.ts) does not also run.
  function leaveText(ev: KeyboardEvent): void {
    const region = win.root.closest<HTMLElement>("[data-win]");
    if (!region) return;
    ev.preventDefault();
    region.focus({ preventScroll: true });
    const armed = new AbortController();
    const signal = armed.signal;
    region.addEventListener(
      "keydown",
      (e) => {
        if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
        armed.abort();
        if (e.target !== region || e.key !== "Tab") return;
        if (e.shiftKey || e.ctrlKey || e.metaKey) return;
        // the browser's own Tab, after this handler, skips the inert content.
        // It is freed once the focus has left the region (blur, during that
        // Tab: a quick Shift+Tab back finds it free), else on the next task
        const kids = [...region.children] as HTMLElement[];
        const was = kids.map((k) => k.inert);
        for (const k of kids) k.inert = true;
        const free = new AbortController();
        const restore = (): void => {
          if (free.signal.aborted) return;
          free.abort();
          kids.forEach((k, i) => (k.inert = was[i]));
        };
        region.addEventListener("blur", restore, { signal: free.signal });
        setTimeout(restore);
      },
      { signal },
    );
    region.addEventListener("blur", () => armed.abort(), { signal });
  }
  for (const type of ["input", "keyup", "click", "select"] as const) {
    area.addEventListener(type, refresh);
  }
  findBar.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      find(ev.shiftKey ? -1 : 1);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      closeFind();
    }
  });
  win.onClose(() => {
    if (forceClose || !modified()) return true;
    void askToSave(
      os,
      "Save your changes before closing?",
      "Writer",
      save,
    ).then((go) => {
      if (go) {
        forceClose = true;
        win.close();
      }
    });
    return false;
  });
  win.onFocus((focused) => {
    if (focused && !win.root.contains(document.activeElement)) area.focus();
  });
  os.proc.onSignal(() => {
    forceClose = true;
  });

  applyView();
  if (startPath) await load(startPath);
  refresh();
  area.focus();
}
