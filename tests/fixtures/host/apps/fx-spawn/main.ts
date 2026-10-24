// 002 R9.b / R10 e2e fixture (test builds only): buttons that call
// proc.spawn, as an app's Help or "open with" does (src/apps/lib/open.ts).
// Results go to globalThis.__fxSpawn; `list()` reads proc.list for the test.
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Spawn fixture" });
  const results: [string, number | string][] = [];
  const add = (name: string, target: string, argv?: string[]): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `fx-${name}`;
    b.textContent = name;
    b.addEventListener("click", () => {
      os.proc.spawn(target, argv).then(
        (pid) => results.push([name, pid]),
        (err: Error) => results.push([name, err.message]),
      );
    });
    win.root.append(b);
  };
  add("writer", "writer", ["--readonly", "/x.md"]);
  add("reader", "reader", ["/x.md"]);
  Object.assign(globalThis, {
    __fxSpawn: { results, list: () => os.proc.list(), pid: os.pid },
  });
}
