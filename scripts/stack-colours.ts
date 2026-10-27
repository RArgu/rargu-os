// Spec 014: the stack chips' colours. content/stack-colours.json holds one
// entry per chip text: a sourced colour, a one-hop `same` (a parent's
// colour) or a neutral. Nothing here fetches anything: the colours were
// copied by hand with their sources (R7).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const COLOURS = join(root, "content/stack-colours.json");

type Entry =
  | { colour: string; source: string; revision: string; detail: string }
  | { same: string; reason: string }
  | { neutral: true; reason: string };
/** A chip's colour: a hex value, or null for a neutral chip. */
export type Table = Map<string, string | null>;

/** Loads and checks the table (R1, R2); `fail` names the problem. */
export function loadColours(path = COLOURS): Table {
  const fail = (why: string): never => {
    throw new Error(`content/stack-colours.json: ${why}`);
  };
  let raw: Record<string, Entry>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return fail(`bad JSON (${(e as Error).message})`);
  }
  const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
  const table: Table = new Map();
  for (const [name, e] of Object.entries(raw)) {
    if (name === "_meta") continue;
    if ("colour" in e) {
      if (!/^#[0-9a-fA-F]{6}$/.test(e.colour))
        fail(`"${name}" has a bad colour "${e.colour}"`);
      if (
        !["source", "revision", "detail"].every((k) =>
          text(e[k as keyof typeof e]),
        )
      )
        fail(`"${name}" needs source, revision and detail`);
      table.set(name, e.colour.toLowerCase());
    } else if ("neutral" in e) {
      if (e.neutral !== true || !text(e.reason))
        fail(`"${name}" neutral needs a reason`);
      table.set(name, null);
    } else if (!("same" in e) || !text(e.reason))
      fail(`"${name}" needs a colour, a "same" with a reason, or neutral`);
  }
  // one hop: a `same` points to an entry that has a colour
  for (const [name, e] of Object.entries(raw)) {
    if (name === "_meta" || !("same" in e)) continue;
    const to = raw[e.same];
    if (e.same === name || !to || !("colour" in to))
      fail(
        `"${name}" has "same": "${e.same}", which is no entry with a colour`,
      );
    table.set(name, table.get(e.same)!);
  }
  return table;
}

/** The colour of chip `name` in project file `file` (R2: an unknown chip
 * fails the build). */
export function colourOf(
  table: Table,
  name: string,
  file: string,
): string | null {
  if (!table.has(name))
    throw new Error(
      `${file}: the stack chip "${name}" has no entry in content/stack-colours.json`,
    );
  return table.get(name)!;
}
