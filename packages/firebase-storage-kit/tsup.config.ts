import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    firebase: "./src/firebase.ts",
  },
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
