import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Repo convention: no globals — import describe/it/expect from "vitest".
    globals: false,
    // Default environment is node (core is DOM-free). Tests that need a DOM
    // opt in per-file with a `// @vitest-environment jsdom` pragma.
  },
});
