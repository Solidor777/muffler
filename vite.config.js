import { defineConfig } from "vite";

/**
 * Vite build configuration for the Muffler Foundry module. Produces a single ESM bundle and
 * one extracted stylesheet in dist/, both referenced by module.json. The bot/ directory is a
 * separate Node package and is not part of this build.
 */
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: "src/main.js",
      formats: ["es"],
      fileName: () => "muffler.mjs",
    },
    rollupOptions: {
      output: {
        assetFileNames: "muffler.css",
      },
    },
  },
});
