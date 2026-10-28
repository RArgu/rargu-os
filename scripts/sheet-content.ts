// R11 / R14: the overlay card, written into index.html at build time from
// content/identity.json, and the project data as `virtual:sheet-projects`,
// read from an ordered allowlist of content/projects/*.md.
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Plugin } from "vite";
import { parseFrontmatter } from "../src/apps/resume/doc.ts";
import { LAYOUT } from "../src/sheet/layout.ts";
import { UNITS } from "./castlewars-frames.ts";
import { requireSheetPage, SHEET_PAGE } from "./sheet-guard.ts";
import { writeup, type Writeup } from "./writeup.ts";
import { STAGES } from "../src/sheet/stages.ts";
import { chipColours, colourOf, loadColours } from "./stack-colours.ts";
import { STRATEGIES } from "../src/sheet/demos/crawler-data.ts";
import {
  FLAG_MIN,
  FLAG_WINDOW,
  flagged,
  HOURS,
  insiderMarket,
  SEED,
  SPIKE,
  SPIKE_LEN,
} from "../src/sheet/demos/insider-data.ts";

const root = resolve(import.meta.dirname, "..");

/** [file in content/projects, window id], in sheet order (owner, 2026-10-22) */
const ALLOWLIST = [
  ["castlesiege", "castlesiege"],
  ["castlewars", "castlewars"],
  ["pentimento", "pentimento"],
  ["focused-web-crawler", "crawler"],
  ["polymarket-insider-trading", "insider"],
] as const;

const STATUS = {
  playable: ["Playable", "play"],
  "in-progress": ["In progress", "wip"],
  planning: ["Planning", "wip"],
  "demo-coming": ["Demo coming", "demo"],
} as const;
export type Status = keyof typeof STATUS;

export interface Project {
  id: string;
  title: string;
  /** the card list's name (owner 2026-10-24); the title when not set */
  short: string;
  year: string;
  status: Status;
  summary: string;
  stack: string[];
  links: string[];
  /** 013: only with `writeup: true` (build side; not in the virtual module) */
  writeup?: Writeup;
  /** 013 R18: `<id>-case-studies.json`, checked, when the write-up has one */
  cases?: Cases;
}

/** 013 R18: case studies shown as in the report, loaded by the page. */
export interface Cases {
  cases: { heading: string; paragraphs: string[] }[];
}

/** `overlay`: a folder whose `<file>.md` adds its frontmatter fields and
 * replaces the body (013: the e2e build's fixture write-ups,
 * tests/fixtures/writeups). */
export function loadProjects(
  dir = join(root, "content/projects"),
  overlay?: string,
): Project[] {
  return ALLOWLIST.map(([file, id]) => {
    const path = join(dir, `${file}.md`);
    const parsed = parseFrontmatter(readFileSync(path, "utf8"));
    const own = overlay && join(overlay, `${file}.md`);
    const over =
      own && existsSync(own) && parseFrontmatter(readFileSync(own, "utf8"));
    const meta = over ? { ...parsed.meta, ...over.meta } : parsed.meta;
    const body = over ? over.body : parsed.body;
    const fail = (field: string): never => {
      throw new Error(`${basename(path)}: bad or missing "${field}"`);
    };
    const text = (field: string): string => {
      const v = meta[field];
      // `summary: |` would parse as the literal "|": block scalars are not supported
      return typeof v === "string" && v.trim() && v !== "|" && v !== ">"
        ? v
        : fail(field);
    };
    const list = (field: string): string[] => {
      const v = meta[field] ?? [];
      return Array.isArray(v) ? v : fail(field);
    };
    const links = list("links");
    // 014 R2: every chip has a colour entry, or the build fails
    for (const c of list("stack")) colourOf(colours(), c, basename(path));
    if (!links.every(isWeb)) fail("links");
    const status = text("status");
    if (!Object.hasOwn(STATUS, status)) fail("status");
    const title = text("title");
    return {
      id,
      title,
      // optional: if present, a non-empty one-line string
      short: Object.hasOwn(meta, "short") ? text("short") : title,
      year: text("year"),
      status: status as Status,
      summary: text("summary"),
      stack: list("stack"),
      links,
      ...(meta.writeup === "true" && {
        writeup: writeup(id, meta, body, diagram(file, dir, overlay), (why) => {
          throw new Error(`${basename(path)}: write-up: ${why}`);
        }),
        cases: cases(id, dir, overlay),
      }),
    };
  });
}

/** 013 R18: the checked `<id>-case-studies.json` (the overlay's first), or
 * undefined when there is none. */
function cases(id: string, dir: string, overlay?: string): Cases | undefined {
  const name = `${id}-case-studies.json`;
  const path = [overlay && join(overlay, name), join(dir, name)].find(
    (p) => p && existsSync(p),
  );
  if (!path) return undefined;
  const bad = (why: string): never => {
    throw new Error(`${name}: ${why}`);
  };
  let d: Cases;
  try {
    d = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return bad(`bad JSON (${(e as Error).message})`);
  }
  const str = (v: unknown) => typeof v === "string" && v.trim() !== "";
  if (!Array.isArray(d?.cases) || !d.cases.length) bad("no cases");
  d.cases.forEach((c, i) => {
    if (!str(c?.heading)) bad(`case ${i + 1} has no heading`);
    if (
      !Array.isArray(c.paragraphs) ||
      !c.paragraphs.length ||
      !c.paragraphs.every(str)
    )
      bad(`case ${i + 1} needs paragraphs of text`);
  });
  return {
    cases: d.cases.map((c) => ({
      heading: c.heading,
      paragraphs: c.paragraphs,
    })),
  };
}

/** 013 R9: the parsed `diagrams/<file>.json` (the overlay's first), or
 * undefined when there is none. */
function diagram(file: string, dir: string, overlay?: string): unknown {
  const name = join("diagrams", `${file}.json`);
  const path = [overlay && join(overlay, name), join(dir, name)].find(
    (p) => p && existsSync(p),
  );
  if (!path) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`${name}: bad JSON (${(e as Error).message})`);
  }
}

// 014: the stack chips' colours, loaded and checked once per run
let table: ReturnType<typeof loadColours> | undefined;
const colours = () => (table ??= loadColours());
let tints: ReturnType<typeof chipColours> | undefined;

/** 014 R4: a stack chip with its light and dark backgrounds (the same for
 * the same text everywhere, R8); a neutral chip keeps --chip. */
function chip(name: string): string {
  const t = (tints ??= chipColours(colours())).get(name);
  const style = t ? ` style="--chip-l:${t.light};--chip-d:${t.dark}"` : "";
  return `<span class="chip"${style}>${esc(name)}</span>`;
}

/** Content links must be web links: no javascript: or data: URLs. */
const isWeb = (v: unknown): boolean => {
  try {
    return ["https:", "http:"].includes(new URL(String(v)).protocol);
  } catch {
    return false;
  }
};

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Identity {
  name: string;
  title: string;
  tagline: string;
  links: { github: string; linkedin: string };
}

function readIdentity(path: string): Identity {
  const id = JSON.parse(readFileSync(path, "utf8")) as Partial<Identity>;
  for (const [field, v] of [
    ["name", id.name],
    ["title", id.title],
    ["tagline", id.tagline],
    ["links.github", id.links?.github],
    ["links.linkedin", id.links?.linkedin],
  ] as [string, unknown][]) {
    if (
      typeof v !== "string" ||
      !v.trim() ||
      (field.startsWith("links.") && !isWeb(v))
    )
      throw new Error(`${basename(path)}: bad or missing "${field}"`);
  }
  return id as Identity;
}

/** 015: the public email is not in the repo. It is two parts in a git-ignored
 * file (content/private/email.local.json: {"emailParts": ["local", "domain"]}).
 * No file: no Email link (the build still works). A file with bad parts
 * fails the build. */
export const EMAIL_FILE = join(root, "content/private/email.local.json");
export function readEmail(path: string): [string, string] | null {
  if (!existsSync(path)) return null;
  const p = (JSON.parse(readFileSync(path, "utf8")) as { emailParts?: unknown })
    .emailParts;
  if (
    !Array.isArray(p) ||
    p.length !== 2 ||
    p.some((x) => typeof x !== "string" || !x.trim())
  )
    throw new Error(`${basename(path)}: bad or missing "emailParts"`);
  return [p[0], p[1]];
}

/** 015 R3: the Email link. The address is never in the page: its two parts
 * are separate data attributes and src/sheet/email.ts joins them at start-up
 * (it sets the href and shows the link). `show` also writes the address as
 * the link text (the printed resume). `nojs` is the text with JavaScript off. */
export function mailLink(
  parts: [string, string] | null,
  { cls = "", show = false, nojs = "" } = {},
): string {
  if (!parts) return "";
  const c = cls ? ` class="${cls}"` : "";
  const n = nojs ? `<noscript>${esc(nojs)}</noscript>` : "";
  return `<a data-mail${show ? '="show"' : ""} data-u="${esc(parts[0])}" data-d="${esc(parts[1])}"${c} hidden>Email</a>${n}`;
}

function card(
  id: Identity,
  projects: Project[],
  email: [string, string] | null,
): string {
  const ext = 'target="_blank" rel="noopener"';
  const go = projects
    .map(
      (p) =>
        `<button type="button" data-go="${p.id}">${esc(p.short)} <em>${STATUS[p.status][1]}</em></button>`,
    )
    .join("");
  const tools = LAYOUT.filter((s) => s.tool)
    .map(
      (s) =>
        `<button type="button" class="app" data-go="${s.id}"><img src="/sheet/${s.id}.png" alt="" width="32" height="32" />${esc(s.tool!)}</button>`,
    )
    .join("");
  // 015 R5: the name, title and tagline are hidden, not deleted. To bring them
  // back, put this in the "more" div, above ".cta":
  //   <div class="who"><b>${esc(id.name)}</b><small>${esc(id.title)}</small></div>
  //   <p class="tag">${esc(id.tagline)}</p>
  return `<div class="railtop"><h1 class="logo">RArgu<span>OS</span></h1></div>
      <div class="more">
        <div class="cta">
          <a class="btn primary" href="/resume" ${ext}>Resume ↗</a>
          <a class="btn" href="${esc(id.links.github)}" ${ext}>GitHub</a>
          <a class="btn" href="${esc(id.links.linkedin)}" ${ext}>LinkedIn</a>
          ${mailLink(email, { cls: "btn" })}
        </div>
        <nav class="index" aria-label="Go to">${go}</nav>
        <div class="index"><h2>Quick tools</h2><div class="apps">${tools}</div></div>
        <button type="button" class="btn" id="reset">↺ Reset page</button>
      </div>`;
}

/** Link text as in the mock: the host, or "repo" for one GitHub repo. */
function linkText(url: string, links: string[]): string {
  const u = new URL(url);
  if (u.hostname !== "github.com") return u.hostname;
  const repos = links.filter((l) => new URL(l).hostname === "github.com");
  return repos.length > 1 ? u.pathname.split("/").pop()! : "repo";
}

// spec 005 R6: the Pentimento footer says it is only a sketch, also without JS
const FOOT: Record<string, string> = {
  pentimento: "Sketch of the planned agent CLI · nothing built yet",
};

// spec 005 R1, R8: Castle Wars' controls, canvas, unit names and footer, in
// the page before JS (src/sheet/demos/castlewars.ts wires them on mount)
function castlewars(demoH: number): string {
  const tabs = ["idle", "walk", "attack", "victory", "death"]
    .map(
      (a, i) =>
        `<button type="button" data-anim="${a}" aria-pressed="${i === 0}">${a}</button>`,
    )
    .join("");
  return `<div class="demo-area cw" style="height:${demoH}px">
        <div class="tb"><div class="cw-tabs" role="group" aria-label="Animation">${tabs}</div><button type="button" class="cw-pause">pause</button></div>
        <div class="cw-stage"><canvas width="560" height="250" aria-label="Castle Wars unit animations"></canvas><div class="cw-state"><span role="status">Animations need JavaScript.</span> <button type="button" class="cw-retry" hidden>Retry</button></div></div>
        <p class="cw-units">Top row: ${UNITS.slice(0, 3).join(", ")} · bottom row: ${UNITS.slice(3).join(", ")}</p>
      </div>
      <div class="wfoot"><span class="cw-info">idle</span><span>6 units · 19–21 frames each</span></div>`;
}

// spec 006 R1, R3: the crawler's columns, the R3 sentence and the footer,
// in the page before JS; src/sheet/demos/crawler.ts fills the rows and shows
// the title bar's Pause (its name follows its action: Pause / Resume)
export const CRAWLER_PAUSE =
  '<button type="button" class="cr-pause" aria-label="Pause" hidden>❚❚</button>';
export function crawlerArea(demoH: number): string {
  const cols = STRATEGIES.map(
    (n) =>
      `<div class="col"><h4><span>${esc(n)}</span><span>–</span></h4><ul></ul></div>`,
  ).join("");
  return `<div class="demo-area crawl-demo" style="height:${demoH}px">
        <div class="crawl">${cols}</div>
        <p class="note">Simulated demo. The interactive tool is planned and is not available here.</p>
      </div>
      <div class="wfoot"><span class="cr-stat">The simulated pages need JavaScript.</span><span>✓ relevant · ✗ rejected</span></div>`;
}

// spec 006 R2, R3, R9: the insider chart's canvas, the flagged list, a text
// summary of the chart and both R3 sentences, in the page before JS (the full
// chart's data, seed SEED); src/sheet/demos/insider.ts draws the chart, plays
// it and shows the title bar's Replay
export const INSIDER_REPLAY =
  '<button type="button" class="ins-replay" aria-label="Replay" hidden>↺</button>';
export function insiderArea(demoH: number): string {
  const m = insiderMarket(SEED);
  const flags = flagged(m);
  const c = (h: number) => `${Math.round(m.price[h] * 100)}¢`;
  const n = flags.length;
  const summary = `Simulated price chart over ${HOURS} hours. The price is ${c(0)} at hour 0 and ${c(SPIKE - 1)} at hour ${SPIKE - 1}. The spike starts at hour ${SPIKE}: ${c(SPIKE + SPIKE_LEN - 1)} by hour ${SPIKE + SPIKE_LEN - 1}, ${c(HOURS - 1)} at hour ${HOURS - 1}. ${n} trade${n === 1 ? "" : "s"} flagged: $${FLAG_MIN}k or more in the ${FLAG_WINDOW} hours before the spike.`;
  const list = flags
    .map(
      (f) =>
        `<div><b>${esc(f.wallet)}</b><br>$${f.amount}k · ${f.hoursBefore}h before</div>`,
    )
    .join("");
  return `<div class="demo-area ins-demo" style="height:${demoH}px">
        <div class="ins"><canvas width="900" height="420" role="img" aria-label="Price chart of an invented market, with its trades" aria-describedby="ins-sum"></canvas><p class="sr" id="ins-sum">${esc(summary)}</p><div class="flags"><span class="note" hidden>Wallets that bought big before the spike show up here.</span>${list}</div></div>
        <p class="note">Simulated demo. The interactive tool is planned and is not available here.<br>It flags candidates and does not prove insider trading.</p>
      </div>
      <div class="wfoot"><span class="ins-t">t = ${HOURS - 1}h of ${HOURS}h</span><span>dot size = trade size</span></div>`;
}

/** windows whose demo area is built (the rest are inert placeholders) */
const DEMO: Record<string, (demoH: number) => string> = {
  castlewars,
  crawler: crawlerArea,
  insider: insiderArea,
};

/** 013 R8: the Read panel: title block, lede, section nav and the body.
 * Hidden until its tab opens it (main.ts) or a /p/ page shows it. */
/** 013 R18, R19: the notice above the case studies (in the page HTML) and
 * their container; case-studies.ts loads them, with JavaScript only. */
function casesHtml(id: string, email: [string, string] | null): string {
  const mail = mailLink(email, { nojs: "Email needs JavaScript" });
  return `<div class="cases-wrap"><p class="cs-notice"><strong>These wallets were candidates from our course project's heuristics, not proof of insider trading.</strong> Figures are from our final report (2026-05-18). A market can be hidden at once. A case study below is removed with the next site update. We reply within 7 days. ${mail ? `To ask for a correction or removal, use this link: ${mail}.` : ""} Copies already saved by others cannot be recalled.</p><div class="cases" data-nosnippet data-src="/p/${id}/case-studies.json"><p class="cases-state">The case studies need JavaScript.</p></div></div>`;
}

export function readPanel(
  p: Project & { writeup: Writeup },
  email: [string, string] | null,
): string {
  const ext = 'target="_blank" rel="noopener"';
  const w = p.writeup;
  const nav = w.anchors
    .map((a) => `<a href="#${a.id}">${esc(a.text)}</a>`)
    .join("");
  return `<div class="read-area" id="${p.id}-read" hidden>
        <header class="r-head"><h2 class="r-title" id="${p.id}-read-title" tabindex="-1">${esc(p.title)}</h2>
          <p class="r-meta"><span class="yr">${esc(p.year)}</span><span class="status ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span> <span class="r-role">${esc(w.role)}</span></p>
          <p class="r-lede">${esc(w.lede)}</p>
          <div class="meta">${p.stack.map(chip).join("")}${p.links.map((l) => `<a href="${esc(l)}" ${ext}>${esc(linkText(l, p.links))} ↗</a>`).join("")}</div>
        </header>
        <nav class="r-nav" aria-label="Sections">${nav}</nav>
        <div class="r-body">${w.html}${p.cases ? casesHtml(p.id, email) : ""}</div>
      </div>`;
}

/** 013 R1: a project window's tab strip, hidden until main.ts shows it
 * (two or more modes). Try waits for a tool (tabs.ts registerTool); only
 * windows with a tool's stage list (stages.ts) can get one. A window that
 * can have one mode only gets no strip. */
const hasTool = (p: Project) => p.id in STAGES;
function tabs(p: Project): string {
  if (!p.writeup && !hasTool(p)) return "";
  const tab = (mode: string, label: string, on: boolean, hide: boolean) =>
    `<button type="button" role="tab" id="${p.id}-tab-${mode}" aria-controls="${p.id}-${mode}" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-mode="${mode}"${hide ? " hidden" : ""}>${label}</button>`;
  return `<div class="tabs" role="tablist" aria-label="${esc(p.title)} view" hidden>${tab("demo", "Demo", true, false)}${hasTool(p) ? tab("try", "Try", false, true) : ""}${p.writeup ? tab("read", "Read", false, false) : ""}</div>`;
}

// R7 / R14: the eight windows at their home positions. The inline transform
// shows the layout without JS; windows.ts owns it after start. R9: each title
// bar has a Home control.
function windows(projects: Project[], email: [string, string] | null): string {
  const ext = 'target="_blank" rel="noopener"';
  return LAYOUT.map((s) => {
    const p = projects.find((p) => p.id === s.id);
    const name = p?.title ?? s.tool ?? s.id;
    const about = p
      ? `<div class="about">
        <div class="phead"><h2>${esc(p.title)}</h2><span class="yr">${esc(p.year)}</span><span class="status ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span></div>
        <p class="blurb">${esc(p.summary)}</p>${p.writeup ? `<a class="nojs-read" href="/p/${p.id}/">Read the write-up</a>` : ""}
        <div class="meta">${p.stack.map(chip).join("")}${p.links.map((l) => `<a href="${esc(l)}" ${ext}>${esc(linkText(l, p.links))} ↗</a>`).join("")}</div>
      </div>`
      : "";
    return `<section class="sheet-win" data-win="${s.id}" role="region" aria-label="${esc(name)}" style="width:${s.w}px;height:${s.h}px;transform:translate(${s.x}px, ${s.y}px)">
      <div class="bar"><span class="grip" aria-hidden="true">⠿</span><span class="t">${esc(s.bar)}</span>${s.id === "crawler" ? CRAWLER_PAUSE : ""}${s.id === "insider" ? INSIDER_REPLAY : ""}${p ? tabs(p) : ""}${p ? `<button type="button" class="expand" aria-label="Expand ${esc(name)}">⤢</button>` : ""}<button type="button" class="home" aria-label="Send ${esc(name)} home">⌂</button></div>
      ${about}
      ${DEMO[s.id] ? DEMO[s.id](s.demoH) : `<div class="demo-area" style="height:${s.demoH}px" inert></div>`}${FOOT[s.id] ? `\n      <div class="wfoot">${esc(FOOT[s.id])}</div>` : ""}${p && hasTool(p) ? `\n      <div class="try-area" hidden></div>` : ""}${p?.writeup ? `\n      ${readPanel({ ...p, writeup: p.writeup }, email)}` : ""}
    </section>`;
  }).join("\n");
}

const VIRTUAL = "virtual:sheet-projects";

export function sheetContent({
  identity = join(root, "content/identity.json"),
  projects = join(root, "content/projects"),
  overlay = undefined as string | undefined,
  emailFile = EMAIL_FILE,
} = {}): Plugin {
  return {
    name: "sheet-content",
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return;
      for (const [file] of ALLOWLIST)
        this.addWatchFile(join(projects, `${file}.md`));
      // 013 R15: the write-ups are HTML in the page, not JS
      const data = loadProjects(projects, overlay).map(
        ({ writeup: _, cases: __, ...p }) => p,
      );
      return `export default ${JSON.stringify(data)};`;
    },
    // 007 R3: the card goes into the sheet's page; no page, no build
    buildStart: requireSheetPage("sheet-content"),
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith(`/${SHEET_PAGE}`)) return html;
      const list = loadProjects(projects, overlay);
      const id = readIdentity(identity);
      const email = readEmail(emailFile);
      return (
        html
          // callbacks: a replacement string would expand $' and $& in content
          .replace("<!-- card -->", () => card(id, list, email))
          .replace("<!-- windows -->", () => windows(list, email))
      );
    },
  };
}
