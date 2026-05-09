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
        <div className="flex w-full pt-14">
          <AppSidebar />
          <main
            className={cn(
              "flex min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col overflow-auto transition-all duration-200",
              sidebarCollapsed ? "ml-[60px]" : "ml-60",
            )}
          >
            <div className="flex min-h-full w-full min-w-0 flex-1 flex-col p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
