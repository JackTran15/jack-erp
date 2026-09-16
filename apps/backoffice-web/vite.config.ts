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
    proxy: {
      // Mirrors the two nginx locations production points at MinIO (A-06): same
      // path, same Host, no rewrite — presigned URLs sign over the path.
      "/erp-media-public": {
        target: "http://localhost:9000",
        changeOrigin: false,
      },
      "/erp-media-private": {
        target: "http://localhost:9000",
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
    allowedHosts: ["jack-erp-backoffice.ducanhzed.com", "erp.giaymt.com.vn", "jack-erp.ducanhzed.com"],
    // Production runs `vite preview`, and Vite falls back to `server.proxy` when
    // this is unset. Media paths belong to nginx there, so opt out explicitly.
    proxy: {},
  },
});
