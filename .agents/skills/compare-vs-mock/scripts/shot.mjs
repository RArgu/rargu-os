// compare-vs-mock: node shot.mjs <url-or-file> <outdir> [WxH[@dark] ...]
// Screenshots one page at each viewport with the repo's Playwright Chromium. Default: 1440x900 390x844, light and dark.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [target, out, ...sizes] = process.argv.slice(2);
if (!target || !out) {
  console.error("usage: node shot.mjs <url-or-file> <outdir> [WxH[@dark] ...]");
  process.exit(1);
}
const list = sizes.length ? sizes : ["1440x900", "1440x900@dark", "390x844", "390x844@dark"];
const url = /^[a-z]+:/.test(target) ? target : "file://" + new URL(target, "file://" + process.cwd() + "/").pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const s of list) {
  const [, w, h, dark] = s.match(/^(\d+)x(\d+)(@dark)?$/) ?? [];
  if (!w) throw new Error("bad size " + s);
  const page = await browser.newPage({
    viewport: { width: +w, height: +h },
    deviceScaleFactor: 2,
    colorScheme: dark ? "dark" : "light",
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${s.replace("@", "-")}.png` });
  await page.close();
}
await browser.close();
