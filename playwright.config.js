import { defineConfig } from "@playwright/test";

/**
 * Playwright e2e configuration. Attaches to a Foundry instance already running on
 * localhost:30000 with a world open; it does not boot or tear down the server. All artifacts
 * are written under test/build/ so they never enter the shipping bundle.
 */
export default defineConfig({
  testDir: "test/e2e",
  outputDir: "test/build/e2e",
  reporter: [
    [
      "html",
      {
        outputFolder: "test/build/playwright-report",
        open: "never",
      },
    ],
  ],
  use: {
    baseURL: "http://localhost:30000",
    viewport: {
      width: 1600,
      height: 900,
    },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
});
