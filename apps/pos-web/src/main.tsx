// Must precede every other import: the checkout store calls randomUUID at module scope.
import "./lib/common/crypto-polyfill";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@erp/ui/globals.css";
import "./styles/pos-accessible.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
