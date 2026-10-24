// 002 R6.a e2e fixture (test builds only): a press writes ~/.config/x.json
// (not a document: no download), then ~/note.txt (a document: downloads).
import type { OS } from "../../../../../src/sdk/os";

export default async function main(os: OS): Promise<void> {
  const win = os.ui.createWindow({ title: "Files fixture" });
  const b = document.createElement("button");
  b.className = "fx-write";
  b.textContent = "Write";
  b.addEventListener("click", () => {
    void (async () => {
      await os.fs.mkdir("~/.config", { recursive: true });
      await os.fs.writeFile("~/.config/x.json", '{"x":1}');
      await os.fs.writeFile("~/note.txt", "note");
    })();
  });
  win.root.append(b);
}
