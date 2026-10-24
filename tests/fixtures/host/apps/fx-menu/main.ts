// 002 R5.b e2e fixture (test builds only): a menu with a submenu, a disabled
// item, separators, a radio group (checked items the app sets again, as
// Paint's zoom group) and shortcuts; a disabled submenu and a disabled
// header; an item that opens a dialog; a text field and an editable div.
// Chosen items go to globalThis.__fxMenu, which can also set the menu again
// (as an app does on its own) and close the window.
import type { MenuItem, OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Menu fixture" });
  const chosen: string[] = [];
  const pick = (name: string) => () => void chosen.push(name);
  let size = "Small";
  const draw = (): void => {
    const radio = (label: string): MenuItem => ({
      label,
      checked: size === label,
      action: () => {
        chosen.push(label);
        size = label;
        draw();
      },
    });
    win.setMenu({
      items: [
        {
          label: "File",
          children: [
            {
              label: "Recent",
              children: [{ label: "a.txt", action: pick("a.txt") }],
            },
            {
              label: "Locked",
              disabled: true,
              children: [
                { label: "Inner", shortcut: "Ctrl+J", action: pick("Inner") },
              ],
            },
            { label: "Gone", disabled: true, action: pick("Gone") },
            { label: "", separator: true },
            { label: "Mark", shortcut: "Ctrl+K", action: pick("Mark") },
            { label: "Redo", shortcut: "Ctrl+Shift+Z", action: pick("Redo") },
            { label: "Ask…", action: () => void os.ui.confirm("Sure?") },
          ],
        },
        { label: "Off", disabled: true, action: pick("Off") },
        {
          label: "View",
          children: [radio("Small"), radio("Large")],
        },
      ],
    });
  };
  draw();
  const field = document.createElement("input");
  field.className = "fx-field";
  const edit = document.createElement("div");
  edit.className = "fx-edit";
  edit.contentEditable = "true";
  edit.textContent = "edit me";
  win.root.append(field, edit);
  Object.assign(globalThis, {
    __fxMenu: { chosen, redraw: draw, close: () => win.close() },
  });
}
