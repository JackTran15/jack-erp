import { createContext, useContext } from "react";

interface LayoutContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within BackofficeLayout");
  return ctx;
}
