// SPDX-FileCopyrightText: 2026 OOO Agitek
// SPDX-License-Identifier: MIT

import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "release/**", "__mocks__/**", "**/*.test.ts", "esbuild.config.mjs", "scripts/**", "src/sync-client/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {

      "obsidianmd/ui/sentence-case": "off",
    },
  },
);
