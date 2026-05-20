import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: {
    compilerOptions: {
      stripInternal: true,
    },
  },
  clean: true,
  treeshake: true,
  splitting: true,
  sourcemap: true,
});
