// 002 R2 / R11 e2e fixture (test builds only): focuses its own control in
// main() without win.focus(), and logs what onFocus hears.
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Focus fixture" });
  const log: boolean[] = [];
  win.onFocus((f) => log.push(f));
  const input = document.createElement("input");
  input.className = "fx-focus";
  input.setAttribute("aria-label", "Fixture field");
  win.root.append(input);
  input.focus();
  Object.assign(globalThis, { __fxFocus: { log } });
}
