import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

/**
 * ESLint flat configuration for the Foundry module (src + test). Applies recommended rules,
 * declares the ambient Foundry/browser globals as read-only, and defers formatting to
 * Prettier. The bot/ package has its own tooling and is excluded here.
 */
export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        game: "readonly",
        Hooks: "readonly",
        foundry: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        ui: "readonly",
        Handlebars: "readonly",
      },
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettier,
];
