/**
 * Vitest configuration for the Muffler bot.
 * Locates test files under test/ without requiring the nested unit/ subfolder.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
    },
});
