import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The React Compiler runs over every .tsx file in the test pipeline — the
  // same memoizing transform the app applies via `reactCompiler: true` — so
  // the react adapter's tests exercise the compiled shape the app actually
  // ships. Widget-freeze regressions (LOS-567) reproduce here instead of
  // only in the browser.
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  test: {
    // Repo convention: no globals — import describe/it/expect from "vitest".
    globals: false,
    // Default environment is node (core is DOM-free). Tests that need a DOM
    // opt in per-file with a `// @vitest-environment jsdom` pragma.
  },
});
