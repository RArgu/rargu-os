// 002 R12 e2e fixture (test builds only): a partial start that holds a
// resource (a timer) released by its termination handler, then throws.
import type { OS } from "../../../../../src/sdk/os";

interface Leak {
  ticks: number;
  live: number;
  released: number;
}
const g = globalThis as unknown as { __fxLeak?: Leak };

export default async function main(os: OS): Promise<void> {
  const leak = (g.__fxLeak ??= { ticks: 0, live: 0, released: 0 });
  const win = os.ui.createWindow({ title: "Leak fixture" });
  win.root.append(document.createElement("p"));
  const timer = setInterval(() => leak.ticks++, 50);
  leak.live++;
  os.proc.onSignal(() => {
    clearInterval(timer);
    leak.live--;
    leak.released++;
  });
  throw new Error("leak fixture failed");
}
