// 002 R12.a e2e fixture (test builds only): starts part of its window, then
// throws in main.
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Throw fixture" });
  const p = document.createElement("p");
  p.textContent = "half started";
  win.root.append(p);
  throw new Error("fixture start failed");
}
