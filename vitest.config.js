import { defineConfig } from "vitest/config";

/**
 * Vitest configuration: jsdom environment for DOM-dependent unit tests, with all artifacts
 * written under test/build/ so test output never enters the shipping dist/ bundle.
 */
export default defineConfig({
  cacheDir: "test/build/.vitest",
  test: {
    environment: "jsdom",
    include: ["test/unit/**/*.test.js"],
    root: ".",
    coverage: {
      reportsDirectory: "test/build/coverage",
    },
  },
});
