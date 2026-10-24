// 002 R10 e2e fixture (test builds only): the first start waits in main()
// until the test releases it; the visitor closes that start, starts the app
// again, and then the old start goes on and uses its OS. It must not touch
// the new start. Later starts do not wait. Log: globalThis.__fxHeld.
import type { OS } from "../../../../../src/sdk/os";

interface Held {
  starts: number;
  release(): void;
  /** what the old start's calls did: "ok" or the error message */
  stale: Record<string, string>;
  /** bus messages each start heard on topic t, by start number */
  heard: Record<number, number>;
  /** termination handler runs, by start number */
  signals: Record<number, number>;
}
const g = globalThis as unknown as { __fxHeld?: Held };

export default async function main(os: OS): Promise<void> {
  const held = (g.__fxHeld ??= {
    starts: 0,
    release: () => {},
    stale: {},
    heard: {},
    signals: {},
  });
  const n = ++held.starts;
  const win = os.ui.createWindow({ title: "Held fixture" });
  win.setTitle(`held ${n}`);
  const add = (cls: string, fn: () => void): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = cls;
    b.addEventListener("click", fn);
    win.root.append(b);
  };
  add("fx-close", () => win.close());
  add("fx-publish", () => os.bus.publish("t", n));
  held.heard[n] = 0;
  held.signals[n] = 0;
  os.bus.subscribe("t", () => held.heard[n]++);
  os.proc.onSignal(() => void held.signals[n]++);
  if (n > 1) return;

  await new Promise<void>((done) => (held.release = done));
  // the old start goes on: each call is logged, none may reach start 2
  const tryIt = (name: string, fn: () => unknown): void => {
    try {
      fn();
      held.stale[name] = "ok";
    } catch (err) {
      held.stale[name] = (err as Error).message;
    }
  };
  tryIt("setTitle", () => win.setTitle("stale"));
  tryIt("subscribe", () => os.bus.subscribe("t", () => held.heard[n]++));
  tryIt("onSignal", () => os.proc.onSignal(() => void held.signals[n]++));
  tryIt("createWindow", () =>
    os.ui.createWindow({ title: "Stale child", modal: true }),
  );
  tryIt("alert", () => void os.ui.alert("stale"));
  tryIt("close", () => win.close());
}
