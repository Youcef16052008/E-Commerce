import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "./.next/**",
    "./out/**",
    "./build/**",
    "./coverage/**",
    "next-env.d.ts",
    "drizzle/**",
    "tests/**",
    "./.scratch/**",
  ]),
  // Rule-01 dependency rule (docs/architecture.md §1, fix-plan L6.6). Expressed
  // with core `no-restricted-imports` — no extra plugin, no folder renames.
  // Layer order inside a feature: domain ← application ← infrastructure ← ui.
  {
    files: ["src/features/*/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/server/*",
                "@/app/*",
                "@/features/*/application/*",
                "@/features/*/infrastructure/*",
                "@/features/*/ui/*",
                "next",
                "next/*",
                "react",
                "react-dom",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
                "stripe",
              ],
              message:
                "Rule-01: `domain/` is pure — no framework, DB, server adapters or outer layers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/*/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/features/*/ui/*", "react", "react-dom"],
              message: "Rule-01: `application/` must not depend on UI or route files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/*/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/features/*/ui/*"],
              message: "Rule-01: `infrastructure/` must not depend on UI or route files.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/**/*.{ts,tsx}", "src/shared/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/app/*"],
              message:
                "Rule-01: `server/` and `shared/lib/` are leaves — they never import features or routes.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
