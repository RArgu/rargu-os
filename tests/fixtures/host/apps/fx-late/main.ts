// 002 R10 e2e fixture (test builds only): file calls that outlive their
// start. "fx-save" waits (as Paint's `await encode()`) until "fx-release" is
// pressed, then writes ~/late.txt; "fx-open" waits on the file picker;
// "fx-write" writes at once; "fx-close" closes the app. globalThis.__fxLate
// logs what each start's calls did.
import type { OS } from "../../../../../src/sdk/os";

interface Late {
  starts: number;
  release(): void;
  /** "saved <n>", "opened <n> <path|null>" in the order they settled */
  log: string[];
}
const g = globalThis as unknown as { __fxLate?: Late };

export default async function main(os: OS): Promise<void> {
  const late = (g.__fxLate ??= { starts: 0, release: () => {}, log: [] });
  const n = ++late.starts;
  const win = os.ui.createWindow({ title: "Late fixture" });
  win.setTitle(`late ${n}`);
  const add = (cls: string, fn: () => unknown): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = cls;
    b.addEventListener("click", () => void fn());
    win.root.append(b);
  };
  add("fx-save", async () => {
    await new Promise<void>((done) => (late.release = done));
    await os.fs.writeFile("~/late.txt", `start ${n}`);
    late.log.push(`saved ${n}`);
  });
  add("fx-open", async () =>
    late.log.push(`opened ${n} ${await os.ui.openFile()}`),
  );
  add("fx-write", () => os.fs.writeFile("~/late.txt", `start ${n}`));
  add("fx-release", () => late.release());
  add("fx-close", () => win.close());
}
