import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  // tsconfig keeps JSX as-is for Next; tests that render pages need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/supabase/**", "src/**/*.d.ts"],
      // Ratchet: raise these as tests are added; never lower them.
      // Ratchet: measured 75/54/78/77 on 18 Oct 2026; raise as tests are added, never lower.
      thresholds: { statements: 70, branches: 50, functions: 70, lines: 70 },
    },
    server: {
      deps: {
        // Inline server-only modules so they can be mocked
        inline: ["server-only"],
      },
    },
    alias: {
      "server-only": resolve(__dirname, "tests/__mocks__/server-only.ts"),
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "server-only": resolve(__dirname, "tests/__mocks__/server-only.ts"),
    },
  },
});