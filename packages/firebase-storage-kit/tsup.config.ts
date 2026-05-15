import { defineConfig } from "tsup";

export default defineConfig({
  /* Entry points */
  entry: {
    /* Please edit the package.json exports field if you change the entry points */
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
