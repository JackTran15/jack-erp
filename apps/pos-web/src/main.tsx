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
