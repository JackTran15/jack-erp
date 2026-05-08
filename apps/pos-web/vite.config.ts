import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@erp/pos": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3001,
  },
});
