// Helpers shared by bundled apps, built only on the OS interface: path parts,
// per-app config files, names, Help, save prompts.
import type { OS } from "../../sdk/os";

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}

export function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

/** Reads /home/guest/.config/<id>.json, returning defaults merged with what is stored. */
export async function loadConfig<T extends object>(
  os: OS,
  defaults: T,
): Promise<T> {
  try {
    const raw = JSON.parse(
      await os.fs.readText(`~/.config/${os.app.id}.json`),
    ) as Partial<T>;
    return { ...defaults, ...raw };
  } catch {
    return { ...defaults };
  }
}

export async function saveConfig<T extends object>(
  os: OS,
  config: T,
): Promise<void> {
  try {
    await os.fs.mkdir("~/.config", { recursive: true });
    await os.fs.writeFile(
      `~/.config/${os.app.id}.json`,
      JSON.stringify(config, null, 2) + "\n",
    );
  } catch (err) {
    os.log("warn", "could not save settings:", err);
  }
}

/** Names on the RArgu OS sheet (spec 004 R1): the card's Quick tools labels. */
const SHEET_NAMES: Record<string, string> = {
  paint: "Paint",
  tracker: "Music",
  writer: "Notes",
};

/** The app's name for its title: its sheet name, else `name`. */
export function appName(os: OS, name: string): string {
  return SHEET_NAMES[os.app.id] || name;
}

/** Standard Help menu: About only (spec 004 R8). */
export function helpMenu(os: OS): import("../../sdk/os").MenuItem {
  const items: import("../../sdk/os").MenuItem[] = [];
  const name = appName(os, os.app.name);
  items.push({
    label: `About ${name}`,
    action: () =>
      void os.ui.alert(
        `${name} ${os.app.version ?? ""}\nA RArgu OS program (pid ${os.pid}).`,
        `About ${name}`,
      ),
  });
  return { label: "Help", children: items };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Save / Don't save / Cancel before throwing work away (P18). Resolves true
 * when it is fine to go on: the work was saved, or the visitor chose to drop it.
 */
export async function askToSave(
  os: OS,
  message: string,
  title: string,
  save: () => Promise<boolean>,
): Promise<boolean> {
  const choice = await os.ui.choose(
    message,
    ["Save", "Don't save", "Cancel"],
    title,
  );
  if (choice === 0) return save();
  return choice === 1;
}
