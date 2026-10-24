// 002 R14 e2e fixture (test builds only): records sys.theme.get() at start
// and on each sys:theme message, calls sys.theme.set, and draws one icon
// through a counting icon loader, so the test sees the icons refresh.
import type { OS } from "../../../../../src/sdk/os";
import { icon, setIconLoader } from "../../../../../src/ui/icons";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Theme fixture" });
  const loads: string[] = [];
  setIconLoader(async (path) => {
    loads.push(path);
    return null;
  });
  const p = document.createElement("p");
  p.className = "fx-theme-text";
  p.textContent = "theme fixture";
  win.root.append(p, icon("save-16"));
  const log = {
    start: os.sys.theme.get(),
    events: [] as unknown[],
    gets: [] as string[],
    loads,
    set: "",
  };
  os.bus.subscribe("sys:theme", (data) => {
    log.events.push(data);
    log.gets.push(os.sys.theme.get());
  });
  // R14: set does nothing
  await os.sys.theme.set(log.start === "night" ? "default" : "night");
  log.set = os.sys.theme.get();
  Object.assign(globalThis, { __fxTheme: log });
}
