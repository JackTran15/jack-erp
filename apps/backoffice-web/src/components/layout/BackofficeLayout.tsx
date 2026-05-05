import { useState } from "react";
import { Outlet } from "react-router-dom";
import { cn } from "@erp/ui";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { LayoutContext } from "./LayoutContext";

export function BackofficeLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  return (
    <LayoutContext.Provider value={{ sidebarCollapsed, toggleSidebar }}>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex pt-14">
          <AppSidebar />
          <main
            className={cn(
              "flex-1 overflow-auto transition-all duration-200",
              sidebarCollapsed ? "ml-[60px]" : "ml-60",
            )}
          >
            <div className="w-full px-2 py-6 sm:px-3 lg:px-4">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
