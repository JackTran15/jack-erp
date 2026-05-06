import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Bundle TS source so enums / named exports work (CJS dist breaks Rollup analysis).
    alias: {
      "@erp/shared-interfaces": path.resolve(
        __dirname,
        "../../packages/shared-interfaces/src/index.ts",
      ),
    },
  },
  server: {
    port: 3000,
  },
});
