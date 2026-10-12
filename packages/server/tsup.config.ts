import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  // The shared rules engine is TypeScript source; bundle it into the server build.
  noExternal: ["@nsc/shared"],
});
