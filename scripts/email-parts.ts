// 015 R9: the one reader of the git-ignored email file, used by the sheet build,
// the resume build and the leak check. Errors name the file only, never its text.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const EMAIL_FILE = join(
  resolve(import.meta.dirname, ".."),
  "content/private/email.local.json",
);

/** The two parts, or null when the file is missing. Throws on a bad file. */
export function readEmail(path: string): [string, string] | null {
  if (!existsSync(path)) return null;
  const bad = new Error(`${basename(path)}: bad or missing "emailParts"`);
  let p: unknown;
  try {
    p = (JSON.parse(readFileSync(path, "utf8")) as { emailParts?: unknown })
      ?.emailParts;
  } catch {
    // JSON.parse quotes the input in its message: drop it
    throw bad;
  }
  if (
    !Array.isArray(p) ||
    p.length !== 2 ||
    p.some((x) => typeof x !== "string" || !x.trim())
  )
    throw bad;
  return [p[0], p[1]];
}
