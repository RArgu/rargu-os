// 002 R9 e2e fixture (test builds only): main() spawns its own app id while
// it is starting, as Writer's read-only New does later (writer/main.ts:221).
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Self-spawn fixture" });
  win.root.append(document.createElement("p"));
  const pid = await os.proc.spawn(os.app.id);
  win.setTitle(`self ${pid === os.pid ? "same" : `other ${pid}`}`);
}
