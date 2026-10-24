// spec 002 R7 / assumption 3: the resource table (scripts/host-resources.ts)
// as fs path → contents. It loads with the app host, never in /next's first
// load.
import table from "virtual:host-resources";
import { setIconLoader } from "../../ui/icons";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** fs path → file contents. */
export const RESOURCES: Record<string, string | Uint8Array> = {};
for (const [path, f] of Object.entries(table))
  RESOURCES[path] = f.t === "text" ? f.d : base64ToBytes(f.d);

/** 002 R8: icons.ts reads icons from this table, as data URLs (no object
 * URL to keep, and no request a page's network checks would see). */
export function installIcons(): void {
  setIconLoader((path) => {
    const f = table[path];
    return Promise.resolve(
      f && f.t !== "text" ? `data:image/png;base64,${f.d}` : null,
    );
  });
}
