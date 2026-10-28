import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
/** E2E_BASE_URL=https://rargu.dev runs tests against a deployed site, no local
 * server, and only the `@live` tests: the others need the e2e build (fixture
 * apps, `?host=`, host-assets.json), which production does not have (007 R11). */
const REMOTE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  grep: REMOTE ? /@live/ : undefined,
  use: { baseURL: REMOTE ?? `http://localhost:${PORT}` },
  webServer: REMOTE
    ? undefined
    : {
        // 002 T3: a test build (mode e2e, its own folder) that also holds
        // the host's fixture apps; `npm run build` (production) never does
        command: `npm run build -- --mode e2e --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        // 015 R9.a: the resume step of the test build uses the fake address too
        env: { DPOS_EMAIL: "tests/fixtures/sheet-content/email.json" },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      testIgnore: /compact|routing|drag-perf/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      testMatch: /compact/,
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: "firefox",
      testIgnore: /compact|routing|drag-perf/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "webkit",
      testIgnore: /compact|routing|drag-perf/,
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // 009 R4.a: one worker, after every other project, so nothing else
      // runs while the drag is measured (`--no-deps` runs it alone)
      name: "perf",
      testMatch: /drag-perf/,
      workers: 1,
      dependencies: ["chromium", "mobile", "firefox", "webkit"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
      },
    },
  ],
});
