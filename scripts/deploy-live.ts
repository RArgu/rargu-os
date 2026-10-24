// 007 R11 (T8): deploy rargu.dev with a recorded way back.
// 1. read the active Worker version id; 2. `npm run deploy`; 3. live checks
// (the production-safe `@live` Playwright tests, Chromium + mobile, on
// E2E_BASE_URL, and the R5 routing checks with `curl -sI` against the fixed
// rules of scripts/routes.ts); 4. on a failure, `wrangler rollback <recorded id>` and re-run the
// routing and resume checks; 5. print a log for the ledger.
// Every external command goes through one Runner, so a stub can replace it.
//
//   node scripts/deploy-live.ts --dry-run [--fail=version|live|rollback]
//   node scripts/deploy-live.ts --deploy    (real: only after the owner's G-deploy)
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { NEXT_RULES, RULES, probe } from "./routes.ts";

const WORKER = "rargu-devpage";
const BASE = "https://rargu.dev";

export interface Result {
  code: number;
  stdout: string;
  stderr: string;
}
export type Runner = (
  cmd: string,
  args: string[],
  env?: Record<string, string>,
) => Promise<Result>;
export interface Call {
  cmd: string;
  args: string[];
  env?: Record<string, string>;
}

/** One `curl -sI` check: the accepted statuses and, for a redirect, its Location. */
export interface Check {
  path: string;
  status: number[];
  location?: string;
}

/** The live Playwright run: only tests tagged `@live` in their title. The
 * others need the e2e build (fixture apps, `?host=`, `__host`,
 * host-assets.json), which production does not have (Codex 007 review #1). */
export const LIVE_PLAYWRIGHT = [
  "playwright",
  "test",
  "--project=chromium",
  "--project=mobile",
  "--grep",
  "@live",
];

/** R5: one check per literal rule, one path per wildcard rule, the resume and a
 * 404. `withNext: false` (the re-check after a rollback) skips the /next forms,
 * which are new in this deploy. */
export function routingChecks(withNext: boolean): Check[] {
  const checks: Check[] = RULES.filter(
    (r) => withNext || !NEXT_RULES.includes(r),
  ).map((r) => ({
    path: probe(r.from),
    status: [r.status],
    location: r.to,
  }));
  return [
    ...checks,
    { path: "/resume", status: [200] },
    // the asset handler answers 307 to /resume (wrangler.jsonc), or serves it
    { path: "/resume.html", status: [200, 307, 308], location: "/resume" },
    { path: "/nope", status: [404] },
  ];
}

const sameUrl = (got: string, want: string, base: string) =>
  new URL(got, base).href === new URL(want, base).href;

async function curlCheck(run: Runner, base: string, c: Check) {
  const r = await run("curl", ["-sI", "--max-time", "20", base + c.path]);
  const status = Number(/^HTTP\/\S+\s+(\d{3})/m.exec(r.stdout)?.[1] ?? 0);
  const location = /^location:\s*(\S+)/im.exec(r.stdout)?.[1];
  const redirect = status >= 300 && status < 400;
  const ok =
    r.code === 0 &&
    c.status.includes(status) &&
    (!redirect ||
      (c.location !== undefined &&
        location !== undefined &&
        sameUrl(location, c.location, base)));
  const got = `${status || "no answer"}${location ? ` → ${location}` : ""}`;
  return { ok, line: `${ok ? "ok  " : "FAIL"} ${c.path}: ${got}` };
}

async function runChecks(run: Runner, base: string, checks: Check[]) {
  const lines: string[] = [];
  let ok = true;
  for (const c of checks) {
    const r = await curlCheck(run, base, c);
    ok &&= r.ok;
    lines.push("  " + r.line);
  }
  return { ok, lines };
}

/** The version id that serves 100 % of the newest deployment. */
async function activeVersion(run: Runner): Promise<string> {
  const r = await run("npx", [
    "wrangler",
    "deployments",
    "list",
    "--name",
    WORKER,
    "--json",
  ]);
  if (r.code !== 0)
    throw new Error(`exit ${r.code}: ${(r.stderr || r.stdout).trim()}`);
  const list = JSON.parse(r.stdout.slice(r.stdout.indexOf("["))) as {
    created_on: string;
    versions: { version_id: string; percentage: number }[];
  }[];
  const latest = [...list].sort((a, b) =>
    b.created_on.localeCompare(a.created_on),
  )[0];
  const v = latest?.versions.find((x) => x.percentage === 100);
  if (!v) throw new Error("no version serves 100 % of the newest deployment");
  return v.version_id;
}

const tail = (s: string, n: number) => s.trimEnd().split("\n").slice(-n);
const indent = (s: string[]) => s.map((l) => "    " + l);

export interface Outcome {
  ok: boolean;
  previousId?: string;
  newId?: string;
  rolledBack: boolean;
  unresolved: boolean;
  log: string[];
}

export async function deployLive(
  run: Runner,
  opts: { base?: string } = {},
): Promise<Outcome> {
  const base = opts.base ?? BASE;
  const log: string[] = [];
  const out: Outcome = { ok: false, rolledBack: false, unresolved: false, log };

  try {
    out.previousId = await activeVersion(run);
  } catch (e) {
    log.push(`Version-id read failed: ${(e as Error).message}`);
    log.push("Stopped: not deployed (no recorded version to restore).");
    return out;
  }
  log.push(`Previous version id: ${out.previousId}`);

  const deploy = await run("npm", ["run", "deploy"]);
  log.push(`Deploy (npm run deploy): exit ${deploy.code}`);
  log.push(...indent(tail(deploy.stdout + deploy.stderr, 40)));

  let liveOk = deploy.code === 0;
  try {
    out.newId = await activeVersion(run);
    log.push(`New version id: ${out.newId}`);
  } catch (e) {
    log.push(`New version-id read failed: ${(e as Error).message}`);
    liveOk = false;
  }
  if (deploy.code !== 0 && out.newId === out.previousId) {
    log.push("Deploy failed; the live version did not change. No rollback.");
    return out;
  }

  if (liveOk) {
    const pw = await run("npx", LIVE_PLAYWRIGHT, { E2E_BASE_URL: base });
    log.push(
      `Live Playwright (@live, chromium + mobile) on ${base}: exit ${pw.code}`,
      ...indent(tail(pw.stdout + pw.stderr, 15)),
    );
    const routing = await runChecks(run, base, routingChecks(true));
    log.push(
      `Live routing (curl -sI): ${routing.ok ? "pass" : "FAIL"}`,
      ...routing.lines,
    );
    liveOk = pw.code === 0 && routing.ok;
  }
  if (liveOk) {
    out.ok = true;
    log.push("Result: live checks pass. No rollback.");
    return out;
  }

  log.push(`Live checks failed. Rolling back to ${out.previousId}.`);
  out.rolledBack = true;
  const rb = await run("npx", [
    "wrangler",
    "rollback",
    out.previousId,
    "--name",
    WORKER,
    "-y",
    "-m",
    "007 R11: live checks failed",
  ]);
  log.push(
    `Rollback: exit ${rb.code}`,
    ...indent(tail(rb.stdout + rb.stderr, 20)),
  );
  let now = "unknown";
  try {
    now = await activeVersion(run);
  } catch (e) {
    now = `read failed (${(e as Error).message})`;
  }
  log.push(`Active version id after rollback: ${now}`);
  const re = await runChecks(run, base, routingChecks(false));
  log.push(
    `Re-check routing and resume: ${re.ok ? "pass" : "FAIL"}`,
    ...re.lines,
  );
  if (rb.code === 0 && now === out.previousId && re.ok)
    log.push(`Rollback: success (live is ${out.previousId} again).`);
  else {
    out.unresolved = true;
    log.push("Rollback: UNRESOLVED failure. Check rargu.dev by hand now.");
  }
  return out;
}

/** The real runner: spawns the command, tees its output, collects it. */
export const realRunner: Runner = (cmd, args, env) =>
  new Promise((done) => {
    console.log(`$ ${cmd} ${args.join(" ")}`);
    const p = spawn(cmd, args, { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => {
      stdout += d;
      process.stdout.write(d);
    });
    p.stderr.on("data", (d) => {
      stderr += d;
      process.stderr.write(d);
    });
    p.on("error", (e) => done({ code: 127, stdout, stderr: String(e) }));
    p.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });

/** A dry-run runner with scripted outputs: no spawns, no network. `fail`
 * forces the version-id read, the live checks (Playwright) or the rollback
 * (after a live failure) to fail. */
export function stubRunner(o: {
  previousId: string;
  newId: string;
  fail?: "version" | "live" | "rollback";
  calls?: Call[];
}): Runner {
  let active = o.previousId;
  const answers = new Map(routingChecks(true).map((c) => [c.path, c]));
  const ok = (stdout: string): Result => ({ code: 0, stdout, stderr: "" });
  const bad = (stderr: string): Result => ({ code: 1, stdout: "", stderr });
  return async (cmd, args, env) => {
    o.calls?.push({ cmd, args, env });
    const line = [cmd, ...args].join(" ");
    if (line.includes("wrangler deployments list")) {
      if (o.fail === "version")
        return bad("✘ [ERROR] Not logged in (stub: forced failure)");
      return ok(
        JSON.stringify([
          {
            id: "stub-deployment",
            created_on: new Date().toISOString(),
            versions: [{ version_id: active, percentage: 100 }],
          },
        ]),
      );
    }
    if (line === "npm run deploy") {
      active = o.newId;
      return ok(
        `(stub) Uploaded ${WORKER}\nDeployed ${WORKER} triggers\n  rargu.dev (custom domain)\nCurrent Version ID: ${o.newId}`,
      );
    }
    if (line.startsWith("npx playwright test"))
      return o.fail === "live" || o.fail === "rollback"
        ? {
            code: 1,
            stdout: "(stub) 1 failed (forced)\n  36 passed",
            stderr: "",
          }
        : ok("(stub) 37 passed");
    if (line.includes("wrangler rollback")) {
      if (o.fail === "rollback")
        return bad("✘ [ERROR] Rollback failed (stub: forced failure)");
      active = args[2];
      return ok(`(stub) Worker Version ${args[2]} has been deployed to 100%`);
    }
    if (cmd === "curl") {
      const path = new URL(args[args.length - 1]).pathname;
      const c = answers.get(path);
      const status = c ? c.status[c.status.length - 1] : 404;
      const loc = c?.location ? `location: ${c.location}\r\n` : "";
      return ok(`HTTP/2 ${status}\r\n${loc}server: cloudflare\r\n\r\n`);
    }
    return bad(`(stub) unexpected command: ${line}`);
  };
}

async function main(argv: string[]) {
  const dry = argv.includes("--dry-run");
  if (!dry && !argv.includes("--deploy")) {
    console.log(
      "Usage: node scripts/deploy-live.ts --dry-run [--fail=version|live|rollback]\n" +
        "       node scripts/deploy-live.ts --deploy   (real deploy: G-deploy only)",
    );
    process.exit(2);
  }
  const fail = argv.find((a) => a.startsWith("--fail="))?.slice(7) as
    "version" | "live" | "rollback" | undefined;
  const runner = dry
    ? stubRunner({
        previousId: "00000000-0000-4000-8000-0000000000aa",
        newId: "00000000-0000-4000-8000-0000000000bb",
        fail,
      })
    : realRunner;
  const r = await deployLive(runner);
  console.log(`\n## deploy-live log${dry ? " (DRY RUN, stub runner)" : ""}`);
  console.log(r.log.join("\n"));
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
