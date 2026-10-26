// Spec 013 T8: the event contract (R10, R11) in the e2e build. The tests send
// the events a tool sends (011, 012), on the window node.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const send = (page: Page, id: string, type: string, detail: unknown) =>
  page.evaluate(
    ([id, type, detail]) =>
      document
        .querySelector(`[data-win="${id}"]`)!
        .dispatchEvent(new CustomEvent(type as string, { detail })),
    [id, type, detail] as const,
  );
const stage = (stage: string | null, state = "start", mode = "live") => ({
  stage,
  state,
  mode,
  at: Date.now(),
});
const box = (page: Page, id: string, s: string) =>
  win(page, id).locator(`.dg-box[data-stage="${s}"]`);
const read = (page: Page, id: string) =>
  win(page, id).getByRole("tab", { name: "Read" }).click();

test.describe("013 R10 stage highlight", () => {
  test("R10.c: a start sent before Read opens shows when it opens; done clears it", async ({
    page,
  }) => {
    await page.goto(sheet());
    await send(page, "crawler", "tool:stage", stage("seeds"));
    await send(page, "crawler", "tool:stage", stage("fetch"));
    await read(page, "crawler");
    await expect(box(page, "crawler", "fetch")).toHaveClass(/active/);
    await expect(box(page, "crawler", "fetch").locator(".dg-mark")).toHaveText(
      "running",
    );
    await expect(win(page, "crawler").locator(".dg-box.active")).toHaveCount(1);
    await expect(win(page, "crawler").locator(".dg-live")).toHaveText(
      "Fixture fetch: running",
    );
    // a done for another stage changes nothing; for this one it clears
    await send(page, "crawler", "tool:stage", stage("seeds", "done"));
    await expect(box(page, "crawler", "fetch")).toHaveClass(/active/);
    await send(page, "crawler", "tool:stage", stage("fetch", "done"));
    await expect(win(page, "crawler").locator(".dg-box.active")).toHaveCount(0);
    // an error shows "stopped" until the next start or the end
    await send(page, "crawler", "tool:stage", stage("gate-d"));
    await send(page, "crawler", "tool:stage", stage("gate-d", "error"));
    await expect(box(page, "crawler", "gate-d").locator(".dg-mark")).toHaveText(
      "stopped",
    );
    await expect(box(page, "crawler", "gate-d")).not.toHaveClass(/active/);
    await send(page, "crawler", "tool:stage", stage(null, "done"));
    await expect(
      win(page, "crawler").locator(".dg-mark:not(:empty)"),
    ).toHaveCount(0);
  });

  test("R10.b: a replay says drawing", async ({ page }) => {
    await page.goto(sheet());
    await read(page, "insider");
    await send(
      page,
      "insider",
      "tool:stage",
      stage("moves", "start", "replay"),
    );
    await expect(box(page, "insider", "moves").locator(".dg-mark")).toHaveText(
      "drawing",
    );
  });

  test("R10.d: 50 events in one frame update the diagram once, with the latest", async ({
    page,
  }) => {
    await page.goto(sheet());
    await read(page, "crawler");
    await page.waitForTimeout(300);
    const frames = await page.evaluate(() => {
      let n = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => (n++, raf(cb));
      const w = document.querySelector('[data-win="crawler"]')!;
      const ids = ["seeds", "frontier", "fetch", "gate-a", "gate-b"];
      for (let i = 0; i < 50; i++)
        w.dispatchEvent(
          new CustomEvent("tool:stage", {
            detail: { stage: ids[i % 5], state: "start", mode: "live", at: i },
          }),
        );
      return n;
    });
    expect(frames).toBe(1);
    await expect(box(page, "crawler", "gate-b")).toHaveClass(/active/);
    await expect(win(page, "crawler").locator(".dg-box.active")).toHaveCount(1);
  });

  test("R10.e (013 side): opening Read sends tool:read-open once", async ({
    page,
  }) => {
    await page.goto(sheet());
    await page.evaluate(() => {
      const w = document.querySelector('[data-win="crawler"]')!;
      (window as unknown as { opened: number }).opened = 0;
      w.addEventListener(
        "tool:read-open",
        () => (window as unknown as { opened: number }).opened++,
      );
    });
    await read(page, "crawler");
    await win(page, "crawler").getByRole("tab", { name: "Demo" }).click();
    await read(page, "crawler");
    expect(
      await page.evaluate(
        () => (window as unknown as { opened: number }).opened,
      ),
    ).toBe(2);
  });
});

test.describe("013 R11 status", () => {
  test("R11.a: judge offline and busy in text; the insider status line", async ({
    page,
  }) => {
    await page.goto(sheet());
    await read(page, "insider");
    const line = win(page, "insider").locator(".dg-statusline");
    await expect(line).toHaveText("Status not available");
    await send(page, "insider", "tool:status", {
      lastRun: "2026-10-26T03:00:00Z",
      nextRun: "2026-10-27T03:00:00Z",
      waiting: 3,
      at: Date.now(),
    });
    await expect(line).toContainText("· 3 requests waiting");
    await expect(line).toContainText("Last run ");
    await win(page, "insider").getByRole("tab", { name: "Demo" }).click();
    // the crawler: no status yet changes nothing
    await read(page, "crawler");
    const judge = box(page, "crawler", "gate-d");
    await expect(judge.locator(".dg-status")).toHaveCount(0);
    await send(page, "crawler", "tool:status", { judge: "offline", at: 1 });
    await expect(judge.locator(".dg-status")).toHaveText("offline");
    await send(page, "crawler", "tool:status", { judge: "busy", at: 2 });
    await expect(judge.locator(".dg-status")).toHaveText("busy");
    await send(page, "crawler", "tool:status", { judge: "online", at: 3 });
    await expect(judge.locator(".dg-status")).toHaveCount(0);
  });
});
