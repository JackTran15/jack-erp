import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { navConfig, type NavSection } from "./navConfig";
import {
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Button,
  ScrollArea,
  Separator,
} from "@erp/ui";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";

function sectionContainsRoute(section: NavSection, pathname: string): boolean {
  return section.children.some((c) => {
    if (c.end) return pathname === c.to;
    return pathname === c.to || pathname.startsWith(c.to + "/");
  });
}

export function BackofficeNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    void logout().then(() => navigate("/login", { replace: true }));
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link to="/" className="text-lg font-bold text-foreground no-underline">
          ERP Backoffice
        </Link>
        <button
          type="button"
          className="lg:hidden rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-2">
        <nav aria-label="Điều hướng chính">
          {navConfig.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              pathname={location.pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="fixed top-0 left-0 z-40 flex h-14 w-full items-center border-b bg-background px-4 lg:hidden">
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          onClick={() => setMobileOpen(true)}
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="ml-3 text-sm font-semibold">ERP Backoffice</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0 lg:static lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

function SidebarSection({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection;
  pathname: string;
  onNavigate: () => void;
}) {
  const isActive = sectionContainsRoute(section, pathname);
  const [open, setOpen] = useState(isActive);
  const Icon = section.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{section.label}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="ml-4 mt-1 space-y-0.5 border-l pl-3">
          {section.children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                end={child.end}
                onClick={onNavigate}
                className={({ isActive: active }) =>
                  cn(
                    "block rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                  )
                }
              >
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
