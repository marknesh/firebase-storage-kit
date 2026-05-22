import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      stripInternal: true,
      ignoreDeprecations: "6.0",
    },
  },
  clean: true,
  treeshake: true,
  splitting: true,
  sourcemap: true,
});
