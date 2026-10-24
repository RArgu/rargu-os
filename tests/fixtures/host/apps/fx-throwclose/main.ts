// 002 R10 e2e fixture (test builds only): a child window whose onClose
// throws, and an onFocus that throws on focus loss. Quit (in the child) opens
// a confirm over the child and closes the main window at once: the app must
// still end, and the confirm must settle (globalThis.__fxConfirm).
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Throwing close fixture" });
  win.onFocus((f) => {
    if (!f) throw new Error("focus callback failed");
  });
  const open = document.createElement("button");
  open.type = "button";
  open.className = "fx-child";
  open.textContent = "child";
  open.addEventListener("click", () => {
    const dlg = os.ui.createWindow({ title: "Throwing child", modal: true });
    dlg.onClose(() => {
      throw new Error("child close callback failed");
    });
    const quit = document.createElement("button");
    quit.type = "button";
    quit.className = "fx-quit";
    quit.textContent = "quit";
    quit.addEventListener("click", () => {
      void os.ui.confirm("Sure?").then((v) => {
        (globalThis as unknown as { __fxConfirm?: boolean }).__fxConfirm = v;
      });
      win.close();
    });
    dlg.root.append(quit);
  });
  win.root.append(open);
}
