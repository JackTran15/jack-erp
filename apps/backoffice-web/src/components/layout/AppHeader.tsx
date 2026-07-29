import { Link } from "react-router-dom";
import { BranchSelector } from "./BranchSelector";
import { UserMenu } from "./UserMenu";

/**
 * Minimal fixed top-bar: brand on the left, user menu on the right.
 * Module navigation lives entirely in AppSidebar.
 */
export function AppHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
      <Brand />
      <div className="flex items-center gap-2">
        <BranchSelector />
        <UserMenu />
      </div>
    </header>
  );
}

function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 text-sidebar-foreground no-underline hover:opacity-90"
    >
      <span className="text-sm font-bold tracking-tight">ERP</span>
      <span className="hidden text-xs font-medium text-sidebar-muted-foreground sm:block">
        Backoffice
      </span>
    </Link>
  );
}
