import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: {
    compilerOptions: {
      ignoreDeprecations: "6.0",
      stripInternal: true,
    },
  },
  entry: ["./src/index.ts"],
  format: ["esm"],
  sourcemap: true,
  splitting: true,
  treeshake: true,
});
