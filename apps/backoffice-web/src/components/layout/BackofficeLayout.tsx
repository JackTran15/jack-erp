import { useState } from "react";
import { cn } from "@erp/ui";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { LayoutContext } from "./LayoutContext";
import { RouteAccessGuard } from "./RouteAccessGuard";
import { useIncomingBranchHandoff } from "../../hooks/iam/useIncomingBranchHandoff";

export function BackofficeLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev);

  // Áp dụng chi nhánh truyền từ POS (?branchId=) khi vừa vào ERP.
  useIncomingBranchHandoff();

  return (
    <LayoutContext.Provider value={{ sidebarCollapsed, toggleSidebar }}>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex w-full pt-14">
          <AppSidebar />
          <main
            className={cn(
              "flex h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col overflow-auto transition-all duration-200",
              sidebarCollapsed ? "ml-[60px]" : "ml-60",
            )}
          >
            <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col p-2.5">
              <RouteAccessGuard />
            </div>
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
