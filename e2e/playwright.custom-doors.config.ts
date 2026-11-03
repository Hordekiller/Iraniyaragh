import { defineConfig, devices } from "@playwright/test";
/** Focused UI acceptance with intercepted, explicitly TEST ONLY API catalog.
 * Real DB/provider mock acceptance lives in the API integration suite. */
export default defineConfig({
  testDir: "./tests",
  testMatch: /web-custom-doors\.spec\.ts/,
  workers: 1,
  timeout: 45000,
  reporter: [["list"]],
  outputDir: "test-results/custom-doors",
  use: {
    baseURL: "http://127.0.0.1:4183",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "door-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "door-mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "door-small-mobile",
      use: { ...devices["iPhone SE"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node scripts/storefront-server.mjs fixture",
    env: {
      STOREFRONT_E2E_PORT: "4183",
      STOREFRONT_E2E_API_URL: "http://127.0.0.1:4000",
    },
    url: "http://127.0.0.1:4183",
    timeout: 180000,
    reuseExistingServer: true,
  },
});
