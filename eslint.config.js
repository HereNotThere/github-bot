import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importXPlugin from "eslint-plugin-import-x";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import tsdocPlugin from "eslint-plugin-tsdoc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  // Ignore patterns
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**", "vitest.*", "tests/**"],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended configs
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Prettier config (disables conflicting rules)
  prettierConfig,

  // Main config for TypeScript files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: path.resolve(__dirname, "tsconfig.json"),
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "import-x": importXPlugin,
      prettier: prettierPlugin,
      tsdoc: tsdocPlugin,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: path.resolve(__dirname, "tsconfig.json"),
        },
      },
    },
    rules: {
      ...importXPlugin.configs.recommended.rules,
      ...importXPlugin.configs.typescript.rules,
      "prettier/prettier": "error",
      "no-console": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNever: true,
          allowBoolean: true,
          allowNumber: true,
          allowAny: true,
          allowNullish: true,
        },
      ],
      "@typescript-eslint/no-empty-function": [
        "error",
        {
          allow: ["arrowFunctions"],
        },
      ],
      "@typescript-eslint/ban-ts-comment": "off",
      "tsdoc/syntax": "warn",
    },
  },

  // Test file overrides
  {
    files: ["**/*.test.*", "**/*.test_util.*"],
    rules: {
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "tsdoc/syntax": "off",
    },
  }
);
