// Must precede every other import: call sites run at module scope.
import "./lib/crypto-polyfill";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Dev-only: hover element + ⌘C để copy HTML + component stack + vị trí source cho agent.
// `import.meta.env.DEV` là hằng số lúc build nên nhánh này bị loại khỏi bundle production
// (production chạy `vite preview` trên dist/ — xem ecosystem.config.cjs).
if (import.meta.env.DEV) {
  void import("react-grab");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
