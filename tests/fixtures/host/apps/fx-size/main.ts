// 002 R2.a e2e fixture (test builds only): sets its title and size, takes the
// focus, and leaves its window and resize log on globalThis for the test.
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Size fixture" });
  const resizes: [number, number][] = [];
  win.onResize((w, h) => resizes.push([w, h]));
  const p = document.createElement("p");
  p.textContent = "size fixture";
  win.root.append(p);
  win.setTitle("x");
  win.setSize(300, 200);
  win.focus();
  Object.assign(globalThis, { __fxSize: { win, resizes } });
}
