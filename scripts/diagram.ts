// Spec 013 R9: a write-up's system diagram, from a JSON file, as HTML at
// build time: tiers top to bottom, boxes in a tier side by side (they wrap at
// narrow widths), arrows between tiers, labelled loops back to a box.
import { STAGES } from "../src/sheet/stages.ts";

interface Box {
  id: string;
  label: string;
  name: string;
  keywords: string;
  note?: string;
  stage?: string;
}
interface Tier {
  boxes: Box[];
  loop?: { to: string; text: string };
}
export interface Diagram {
  caption: string;
  tiers: Tier[];
}

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Checks `data` against the R9 schema for window `win`; `fail` throws. */
export function checkDiagram(
  win: string,
  data: unknown,
  fail: (why: string) => never,
): Diagram {
  const str = (v: unknown, what: string): string =>
    typeof v === "string" && v.trim() ? v : fail(`diagram: ${what}`);
  const d = data as Diagram;
  str(d?.caption, "missing caption");
  if (!Array.isArray(d.tiers) || !d.tiers.length) fail("diagram: no tiers");
  const stages = STAGES[win] ?? [];
  const ids = new Set<string>();
  const used = new Set<string>();
  d.tiers.forEach((t, i) => {
    if (!Array.isArray(t?.boxes) || !t.boxes.length)
      fail(`diagram: tier ${i + 1} has no boxes`);
    for (const b of t.boxes) {
      const id = str(b?.id, `a box in tier ${i + 1} has no id`);
      if (ids.has(id)) fail(`diagram: box id "${id}" is used twice`);
      ids.add(id);
      for (const f of ["label", "name", "keywords"] as const)
        str(b[f], `box "${id}" has no ${f}`);
      if (b.note !== undefined) str(b.note, `box "${id}" has an empty note`);
      if (b.stage === undefined) continue;
      if (!stages.includes(b.stage))
        fail(
          `diagram: box "${id}" has stage "${b.stage}", not a stage of ${win}`,
        );
      if (used.has(b.stage))
        fail(`diagram: stage "${b.stage}" is on two boxes`);
      used.add(b.stage);
    }
    // a loop goes back to a box of this tier or an earlier one
    if (t.loop !== undefined) {
      str(t.loop?.text, `tier ${i + 1} has a loop with no text`);
      const back = d.tiers.slice(0, i + 1).flatMap((x) => x.boxes ?? []);
      if (!back.some((b) => b.id === t.loop!.to))
        fail(`diagram: tier ${i + 1} loops to "${t.loop.to}", no box above`);
    }
  });
  const missing = stages.filter((s) => !used.has(s));
  if (missing.length) fail(`diagram: stages on no box: ${missing.join(", ")}`);
  return d;
}

/** The diagram as HTML. Colours come from the sheet's tokens (readme.css). */
export function diagramHtml(d: Diagram): string {
  const names = new Map(
    d.tiers.flatMap((t) => t.boxes.map((b) => [b.id, b.name] as const)),
  );
  const tiers = d.tiers
    .map((t, i) => {
      const boxes = t.boxes
        .map(
          (b) =>
            `<div class="dg-box" data-box="${esc(b.id)}"${b.stage ? ` data-stage="${esc(b.stage)}"` : ""}><span class="dg-label">${esc(b.label)}</span><b class="dg-name">${esc(b.name)}</b><span class="dg-kw">${esc(b.keywords)}</span>${b.note ? `<span class="dg-note">${esc(b.note)}</span>` : ""}<span class="dg-mark"></span></div>`,
        )
        .join("");
      const loop = t.loop
        ? `<p class="dg-loop"><span aria-hidden="true">↺ </span>${esc(t.loop.text)} (back to ${esc(names.get(t.loop.to)!)})</p>`
        : "";
      const arrow =
        i < d.tiers.length - 1
          ? `<span class="dg-arrow" aria-hidden="true">↓</span>`
          : "";
      return `<li class="dg-tier"><div class="dg-boxes">${boxes}</div>${loop}${arrow}</li>`;
    })
    .join("");
  return `<figure class="dg"><ol class="dg-tiers">${tiers}</ol><figcaption>${esc(d.caption)}</figcaption><p class="dg-live" aria-live="polite"></p></figure>`;
}
