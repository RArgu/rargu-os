// 002 R1.a fixture: touches every OS member of spec 002 assumption 1, once.
import type { OS } from "../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  void [os.app.id, os.app.name, os.app.version, os.argv, os.pid];
  void [os.env.DISPLAY, os.env.DISPLAY_POLICY];
  os.log("info", "members fixture");

  await os.fs.readText("/a");
  await os.fs.readFile("/a");
  await os.fs.writeFile("/a", "x");
  await os.fs.readdir("/");
  await os.fs.stat("/a");
  await os.fs.exists("/a");
  await os.fs.mkdir("/d");
  os.fs.resolve("a");

  await os.proc.spawn("writer", ["/x"]);
  os.proc.list();
  os.proc.onSignal(() => {});

  const win = os.ui.createWindow({ title: "Members" });
  void [win.id, win.root];
  win.setTitle("t");
  win.setMenu(null);
  win.setSize(300, 200);
  win.setPosition(1, 2);
  win.focus();
  win.onClose(() => {});
  win.onResize(() => {});
  win.onFocus(() => {});
  win.close();
  await os.ui.alert("a");
  await os.ui.confirm("c");
  await os.ui.choose("?", ["A", "B"]);
  await os.ui.prompt("p");
  os.ui.notify("n");
  await os.ui.openFile();
  await os.ui.saveFile();

  os.bus.publish("t", 1);
  os.bus.subscribe("t", () => {})();

  os.sys.theme.get();
  os.sys.sound.enabled();
  os.sys.openExternal("https://example.com/");
}
