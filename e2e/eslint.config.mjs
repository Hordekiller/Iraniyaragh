import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["playwright-report/**", "test-results/**", "test-results-session/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 2023,
      sourceType: "module",
    },
  },
  {
    // Test-database fixture that loads the compiled (CommonJS) API.
    files: ["**/*.cjs"],
    languageOptions: { globals: globals.node, sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
