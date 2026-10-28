// 015 R3.a: fail when the public email is in the built site or the README.
// Usage: node scripts/check-no-email.ts dist README.md [--tracked] [--email path]
// The address comes from content/private/email.local.json (git-ignored). No file:
// nothing to check. --tracked also scans every file git tracks, and the local part.
// Prints `clean`, or `LEAK` with file names, or `ERROR` (exit 1). The address
// is never printed. A read error is an error, not `clean`.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** The address from the local file's `emailParts`; throws on bad parts. */
export function addressFrom(emailPath: string): string {
  const id = JSON.parse(readFileSync(emailPath, "utf8")) as {
    emailParts?: unknown;
  };
  const p = id.emailParts;
  if (
    !Array.isArray(p) ||
    p.length !== 2 ||
    p.some((x) => typeof x !== "string" || !x.trim())
  )
    throw new Error(`${emailPath}: bad or missing "emailParts"`);
  return `${p[0]}@${p[1]}`;
}

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((n) => files(join(path, n)));
}

/** Files under `paths` (any type, read as bytes) that contain a needle. */
export function scan(paths: string[], ...needles: string[]): string[] {
  const all = needles.map((n) => n.toLowerCase());
  return paths.flatMap(files).filter((f) => {
    const text = readFileSync(f).toString("latin1").toLowerCase();
    return all.some((n) => text.includes(n));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = process.argv.slice(2);
    const take = (flag: string): string | undefined => {
      const at = args.indexOf(flag);
      return at >= 0 ? args.splice(at, 2)[1] : undefined;
    };
    const emailPath = resolve(
      take("--email") ??
        join(import.meta.dirname, "../content/private/email.local.json"),
    );
    const tracked = args.includes("--tracked");
    const paths = args.filter((a) => a !== "--tracked");
    if (!tracked && !paths.length) throw new Error("no paths given");
    if (!existsSync(emailPath)) {
      console.log("clean (no local email file: nothing to look for)");
      process.exit(0);
    }
    const address = addressFrom(emailPath);
    const local = address.split("@")[0];
    const list = tracked
      ? execFileSync("git", ["ls-files"], { encoding: "utf8" })
          .split("\n")
          .filter((f) => f && existsSync(f))
      : [];
    const hits = [
      ...scan(
        paths.map((a) => resolve(a)),
        address,
      ),
      // tracked files: the address and its local part
      ...scan(list, address, local),
    ];
    if (hits.length) {
      console.log(`LEAK in ${hits.length} file(s):\n${hits.join("\n")}`);
      process.exit(1);
    }
    console.log("clean");
  } catch (e) {
    console.log(`ERROR ${(e as Error).message}`);
    process.exit(1);
  }
}
