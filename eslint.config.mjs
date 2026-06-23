import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

// Basic, fast linting across the monorepo. Type-aware rules are intentionally
// left off to keep `pnpm lint` cheap; `pnpm typecheck` covers type safety.
// Formatting concerns are owned by Prettier (eslint-config-prettier disables
// any rules that would conflict).
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.turbo/**",
      "bin/**",
      "pocketbase/**",
      "test-results/**",
      "playwright-report/**",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  prettier,
);
