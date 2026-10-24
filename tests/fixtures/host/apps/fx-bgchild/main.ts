// 002 R11 / R3 e2e fixture (test builds only): main() opens a child window
// and focuses an input in it directly, as Paint's "New Picture" does
// (paint/main.ts:1146). In a background start the focus must not move.
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Background child fixture" });
  win.root.append(document.createElement("p"));
  const dlg = os.ui.createWindow({ title: "Early child", modal: true });
  const input = document.createElement("input");
  input.className = "fx-early";
  input.setAttribute("aria-label", "Early field");
  dlg.root.append(input);
  input.focus();
}
