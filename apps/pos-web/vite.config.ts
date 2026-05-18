import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@erp/pos": path.resolve(__dirname, "src"),
      // Bundle TS source so enum values resolve (CJS dist breaks Rollup).
      "@erp/shared-interfaces": path.resolve(
        __dirname,
        "../../packages/shared-interfaces/src/index.ts",
      ),
    },
  },
  server: {
    port: 3001,
  },
  preview: {
    port: 3001,
    host: true,
    allowedHosts: ["jack-erp-pos.ducanhzed.com"],
  },
});
