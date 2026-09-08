import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "plugin/index": "src/plugin/index.ts",
    "react/index": "src/react/index.ts",
  },
  format: ["esm"],
  dts: true,
  // No sourcemaps: src/ does not ship, and the maps' embedded sourcesContent
  // would double the package size.
  sourcemap: false,
  clean: true,
  external: ["react", "react-dom"],
  fixedExtension: false,
});
