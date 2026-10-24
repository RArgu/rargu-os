// 002 R12.a e2e fixture (test builds only): the first main() throws after a
// partial start; every later one works.
import type { OS } from "../../../../../src/sdk/os";

let runs = 0;

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Flaky fixture" });
  const p = document.createElement("p");
  p.className = "fx-flaky";
  p.textContent = `run ${++runs}`;
  win.root.append(p);
  if (runs === 1) throw new Error("first start failed");
  win.setTitle("flaky ok");
}
