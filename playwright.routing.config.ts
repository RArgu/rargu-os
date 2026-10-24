import { defineConfig, devices } from "@playwright/test";

// 007 R5.a: tests/e2e/routing*.spec.ts, against a local `wrangler dev` of a
// fresh production dist/ (no deploy, no remote calls). The main config ignores
// them. 009 R6.f: the 404 page also in WebKit and on a touch phone.
const PORT = 8799;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /routing(-404)?\.spec\.ts$/,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npm run build && npx wrangler dev --local --ip 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/resume`,
    env: { WRANGLER_SEND_METRICS: "false" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "webkit",
      testMatch: /routing-404\.spec\.ts$/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      testMatch: /routing-404\.spec\.ts$/,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
  ],
});
