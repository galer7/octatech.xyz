import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores must come first
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "admin/**",
      "drizzle/**",
      "src/**/*.test.ts",
      "src/test/**/*",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow unused variables prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow explicit any in certain cases (we use it sparingly for middleware)
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
