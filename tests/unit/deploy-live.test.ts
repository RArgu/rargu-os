// @vitest-environment node
// 007 R11 / R11.a (T8): the deploy-and-rollback script, run on a stub runner
// (no process spawns, no network).
import { describe, expect, it } from "vitest";
import {
  LIVE_PLAYWRIGHT,
  deployLive,
  routingChecks,
  stubRunner,
  type Call,
} from "../../scripts/deploy-live.ts";
import { RULES, parseRedirects } from "../../scripts/routes.ts";
const OLD = "11111111-aaaa-4aaa-8aaa-000000000001";
const NEW = "22222222-bbbb-4bbb-8bbb-000000000002";

function run(fail?: "version" | "live" | "rollback") {
  const calls: Call[] = [];
  const runner = stubRunner({
    previousId: OLD,
    newId: NEW,
    fail,
    calls,
  });
  return deployLive(runner).then((r) => ({
    ...r,
    calls,
  }));
}
const cmds = (calls: Call[]) => calls.map((c) => [c.cmd, ...c.args].join(" "));
const rollbacks = (calls: Call[]) =>
  cmds(calls).filter((c) => c.includes("wrangler rollback"));

describe("parseRedirects / routingChecks", () => {
  it("parses a file's rules; a missing status is 302", () => {
    expect(parseRedirects("# comment\n/about /  301\n/x /y\n")).toEqual([
      { from: "/about", to: "/", status: 301 },
      { from: "/x", to: "/y", status: 302 },
    ]);
  });

  it("checks the fixed R5 rules (scripts/routes.ts), one path per wildcard", () => {
    const checks = routingChecks(true);
    expect(checks.slice(0, RULES.length)).toEqual(
      RULES.map((r) => ({
        path: r.from.replace(/\/\*$/, "/x"),
        status: [r.status],
        location: r.to,
      })),
    );
    expect(checks.map((c) => c.path)).toEqual([
      "/next",
      "/next.html",
      "/next/",
      "/about",
      "/about/x",
      "/work",
      "/work/x",
      "/projects",
      "/projects/x",
      "/contact",
      "/contact/x",
      "/writing",
      "/writing/x",
      "/terminal",
      "/terminal/x",
      "/resume",
      "/resume.html",
      "/nope",
    ]);
    // the re-checks after a rollback skip the /next forms (new in this deploy)
    expect(routingChecks(false).map((c) => c.path)).not.toContain("/next");
    expect(routingChecks(false).length).toBe(15);
  });
});

describe("deployLive", () => {
  it("(a) happy path: records the id, deploys, checks pass, no rollback", async () => {
    const r = await run();
    expect(r.ok).toBe(true);
    expect(r.previousId).toBe(OLD);
    expect(r.newId).toBe(NEW);
    const c = cmds(r.calls);
    const read = c.findIndex((x) => x.includes("deployments list"));
    const deploy = c.indexOf("npm run deploy");
    expect(read).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(read);
    expect(c.some((x) => x.startsWith("npx playwright test"))).toBe(true);
    const pw = r.calls.find((x) => x.args[0] === "playwright");
    expect(pw?.env?.E2E_BASE_URL).toBe("https://rargu.dev");
    // fix 1 (Codex 007 review): only the production-safe @live tests
    expect(pw?.args).toEqual(LIVE_PLAYWRIGHT);
    expect(pw?.args).toEqual([
      "playwright",
      "test",
      "--project=chromium",
      "--project=mobile",
      "--grep",
      "@live",
    ]);
    expect(c.filter((x) => x.startsWith("curl -sI")).length).toBe(18);
    expect(rollbacks(r.calls)).toEqual([]);
    expect(r.log.join("\n")).toContain(`Previous version id: ${OLD}`);
    expect(r.log.join("\n")).toContain(`New version id: ${NEW}`);
  });

  it("(b) live-check failure: rolls back to the recorded id and re-checks", async () => {
    const r = await run("live");
    expect(r.ok).toBe(false);
    expect(r.rolledBack).toBe(true);
    expect(r.unresolved).toBe(false);
    expect(rollbacks(r.calls)).toEqual([
      `npx wrangler rollback ${OLD} --name rargu-devpage -y -m 007 R11: live checks failed`,
    ]);
    const c = cmds(r.calls);
    const rb = c.findIndex((x) => x.includes("wrangler rollback"));
    // routing + resume re-checks after the rollback, without the /next forms
    const after = c.slice(rb + 1).filter((x) => x.startsWith("curl -sI"));
    expect(after.length).toBe(15);
    expect(after.some((x) => x.includes("/next"))).toBe(false);
    expect(r.log.join("\n")).toMatch(/Rollback: success/);
  });

  it("(c) version-id read fails: stops before the deploy", async () => {
    const r = await run("version");
    expect(r.ok).toBe(false);
    expect(cmds(r.calls)).not.toContain("npm run deploy");
    expect(rollbacks(r.calls)).toEqual([]);
    expect(r.log.join("\n")).toMatch(/not deployed/);
  });

  it("(d) rollback fails: reported as unresolved", async () => {
    const r = await run("rollback");
    expect(r.ok).toBe(false);
    expect(r.unresolved).toBe(true);
    expect(rollbacks(r.calls).length).toBe(1);
    expect(r.log.join("\n")).toMatch(/UNRESOLVED/);
  });
});
