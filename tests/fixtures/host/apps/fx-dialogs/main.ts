// 002 R3 / R4 e2e fixture (test builds only): buttons that open each ui
// dialog, a child window made exactly as Paint makes "New Picture"
// (paint/main.ts:1091). Results go to globalThis.__fxDialogs.
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Dialogs fixture" });
  const results: [string, unknown][] = [];
  const add = (name: string, open: () => Promise<unknown>): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `fx-${name}`;
    b.textContent = name;
    b.addEventListener("click", () => {
      void open().then((v) => results.push([name, v]));
    });
    win.root.append(b);
  };
  add("choose", () => os.ui.choose("?", ["A", "B", "C"]));
  add("prompt", () => os.ui.prompt("Name?", "x"));
  add("confirm", () => os.ui.confirm("Sure?"));
  add("child", () => {
    const dlg = os.ui.createWindow({
      title: "Child fixture",
      modal: true,
      resizable: false,
      width: 190,
      height: 132,
      minWidth: 160,
      minHeight: 100,
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "fx-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dlg.close());
    dlg.root.append(cancel);
    cancel.focus();
    return new Promise((done) => dlg.onClose(() => done("closed")));
  });
  // as CastleSiege's New Game: a child with controls and no focus call
  add("bare", () => {
    const dlg = os.ui.createWindow({ title: "Bare child", modal: true });
    for (const name of ["first", "second"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `fx-${name}`;
      b.textContent = name;
      dlg.root.append(b);
    }
    return new Promise((done) => dlg.onClose(() => done("closed")));
  });
  Object.assign(globalThis, { __fxDialogs: { results } });
}
