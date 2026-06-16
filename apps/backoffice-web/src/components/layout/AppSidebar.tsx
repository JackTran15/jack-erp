import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ScrollArea,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@erp/ui";
import {
  visibleNavConfig,
  activeModuleFor,
  isFlyoutEnabled,
  type NavChild,
  type NavModule,
  type NavSection,
} from "./navConfig";
import { useLayout } from "./LayoutContext";
import { MegaMenuPanel } from "./MegaMenuPanel";
import { useCurrentView } from "../../store/common/branch/branch.store";

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useLayout();
  const view = useCurrentView();
  const filteredNav = visibleNavConfig(view);
  const activeModule =
    activeModuleFor(location.pathname, filteredNav) ?? filteredNav[0];

  const asideRef = useRef<HTMLElement>(null);
  const megaMenuPanelRef = useRef<HTMLDivElement>(null);

  // Start with all menu groups collapsed and no flyout shown.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [openFlyoutModuleId, setOpenFlyoutModuleId] = useState<string | null>(null);

  useEffect(() => {
    setOpenFlyoutModuleId(null);
  }, [location.pathname]);

  const openFlyoutModule =
    openFlyoutModuleId &&
    filteredNav.find((m) => m.id === openFlyoutModuleId && isFlyoutEnabled(m));

  useEffect(() => {
    if (!openFlyoutModuleId || !openFlyoutModule) return;

    const closeIfOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (asideRef.current?.contains(target)) return;
      if (megaMenuPanelRef.current?.contains(target)) return;
      setOpenFlyoutModuleId(null);
    };

    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [openFlyoutModuleId, openFlyoutModule]);

  useEffect(() => {
    if (!openFlyoutModuleId) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFlyoutModuleId(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [openFlyoutModuleId]);

  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        ref={asideRef}
        className={cn(
          "fixed left-0 top-14 flex h-[calc(100vh-3.5rem)] flex-col border-r border-gray-700 bg-gray-900 text-white transition-all duration-200",
          sidebarCollapsed ? "w-[60px]" : "w-60",
        )}
      >
        <ScrollArea className="flex-1 py-2">
          <nav aria-label="Điều hướng chính">
            {filteredNav.map((module) => (
              <ModuleRow
                key={module.id}
                module={module}
                activeModuleId={activeModule.id}
                isActive={
                  module.id === activeModule.id && openFlyoutModuleId === null
                }
                isOpen={openIds.has(module.id)}
                onToggle={() => toggleOpen(module.id)}
                isFlyoutOpen={openFlyoutModuleId === module.id}
                onToggleFlyout={() =>
                  setOpenFlyoutModuleId((prev) =>
                    prev === module.id ? null : module.id,
                  )
                }
                collapsed={sidebarCollapsed}
                onCollapsedFlyoutOpen={(id) => setOpenFlyoutModuleId(id)}
                pathname={location.pathname}
                openFlyoutModuleId={openFlyoutModuleId}
                suppressRouteActiveHighlight={openFlyoutModuleId !== null}
              />
            ))}
          </nav>
        </ScrollArea>

        <Separator className="bg-gray-700" />

        <CollapseToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Mega-menu panel — fixed overlay to the right of the sidebar */}
      {openFlyoutModule && (
        <MegaMenuPanel ref={megaMenuPanelRef} module={openFlyoutModule} />
      )}
    </TooltipProvider>
  );
}

// ─── Collapse toggle ──────────────────────────────────────────────────────────

function CollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="p-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-9 w-full items-center rounded-md text-gray-400 transition-colors hover:bg-gray-800 hover:text-white",
          collapsed ? "justify-center" : "justify-end gap-1 px-3",
        )}
        aria-label={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <>
            <span className="text-xs">Thu gọn</span>
            <ChevronLeft className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}

// ─── Module row dispatcher ────────────────────────────────────────────────────

interface ModuleRowProps {
  module: NavModule;
  activeModuleId: string;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  isFlyoutOpen: boolean;
  onToggleFlyout: () => void;
  collapsed: boolean;
  pathname: string;
  onCollapsedFlyoutOpen: (moduleId: string) => void;
  openFlyoutModuleId: string | null;
  /** When a flyout mega-menu is open, NavLink-based rows must not use URL match for “selected” styling. */
  suppressRouteActiveHighlight: boolean;
}

function ModuleRow({
  module,
  activeModuleId,
  isActive,
  isOpen,
  onToggle,
  isFlyoutOpen,
  onToggleFlyout,
  collapsed,
  pathname,
  onCollapsedFlyoutOpen,
  openFlyoutModuleId,
  suppressRouteActiveHighlight,
}: ModuleRowProps) {
  // In collapsed mode every module behaves the same: icon-only button → defaultPath
  if (collapsed) {
    const collapsedActive =
      (module.id === activeModuleId && openFlyoutModuleId === null) ||
      Boolean(isFlyoutEnabled(module) && openFlyoutModuleId === module.id);
    return (
      <CollapsedModuleRow
        module={module}
        isActive={collapsedActive}
        onFlyoutOpen={
          isFlyoutEnabled(module) ? () => onCollapsedFlyoutOpen(module.id) : undefined
        }
      />
    );
  }

  // Flyout module (e.g. Danh mục) — no inline expansion, mega-menu handles navigation
  if (isFlyoutEnabled(module)) {
    return (
      <FlyoutModuleRow
        module={module}
        isActive={isActive}
        isFlyoutOpen={isFlyoutOpen}
        onToggleFlyout={onToggleFlyout}
      />
    );
  }

  const allChildren = module.sections.flatMap((s) => s.children);

  // Single child — direct NavLink
  if (allChildren.length === 1) {
    return (
      <DirectNavRow
        module={module}
        child={allChildren[0]}
        suppressRouteActiveHighlight={suppressRouteActiveHighlight}
      />
    );
  }

  // Multiple children — accordion with sub-items
  return (
    <AccordionModuleRow
      module={module}
      isActive={isActive}
      isOpen={isOpen}
      onToggle={onToggle}
      pathname={pathname}
      suppressRouteActiveHighlight={suppressRouteActiveHighlight}
    />
  );
}

// ─── Collapsed: icon-only, tooltip, navigates to defaultPath ──────────────────

function CollapsedModuleRow({
  module,
  isActive,
  onFlyoutOpen,
}: {
  module: NavModule;
  isActive: boolean;
  onFlyoutOpen?: () => void;
}) {
  const navigate = useNavigate();
  const Icon = module.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (onFlyoutOpen) {
              onFlyoutOpen();
              return;
            }
            navigate(module.defaultPath);
          }}
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-md transition-colors",
            isActive
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-white",
          )}
          aria-label={module.label}
          aria-current={isActive ? "page" : undefined}
        >
          <Icon className="h-5 w-5 shrink-0" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {module.label}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Flyout module row ────────────────────────────────────────────────────────

function FlyoutModuleRow({
  module,
  isActive,
  isFlyoutOpen,
  onToggleFlyout,
}: {
  module: NavModule;
  isActive: boolean;
  isFlyoutOpen: boolean;
  onToggleFlyout: () => void;
}) {
  const Icon = module.icon;

  return (
    <button
      type="button"
      onClick={() => onToggleFlyout()}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isFlyoutOpen
          ? "bg-gray-700 text-white font-medium"
          : isActive
            ? "text-white"
            : "text-gray-300 hover:bg-gray-800 hover:text-white",
      )}
      aria-current={isActive && isFlyoutOpen ? "page" : undefined}
      aria-expanded={isFlyoutOpen}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate text-left">{module.label}</span>
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform",
          isFlyoutOpen && "rotate-90",
        )}
      />
    </button>
  );
}

// ─── Direct nav row (single child) ───────────────────────────────────────────

function DirectNavRow({
  module,
  child,
  suppressRouteActiveHighlight,
}: {
  module: NavModule;
  child: NavChild;
  suppressRouteActiveHighlight: boolean;
}) {
  const Icon = module.icon;

  return (
    <NavLink
      to={child.to}
      end={child.end}
      className={({ isActive: routeActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          routeActive && !suppressRouteActiveHighlight
            ? "bg-gray-700 text-white font-medium"
            : "text-gray-300 hover:bg-gray-800 hover:text-white",
        )
      }
      aria-label={module.label}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{module.label}</span>
    </NavLink>
  );
}

// ─── Accordion module row (multiple children) ─────────────────────────────────

interface AccordionModuleRowProps {
  module: NavModule;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  suppressRouteActiveHighlight: boolean;
}

function AccordionModuleRow({
  module,
  isActive,
  isOpen,
  onToggle,
  pathname,
  suppressRouteActiveHighlight,
}: AccordionModuleRowProps) {
  const Icon = module.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            isActive
              ? "bg-gray-700 text-white font-medium"
              : "text-gray-300 hover:bg-gray-800 hover:text-white",
          )}
          aria-expanded={isOpen}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{module.label}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {module.sections.map((section) => (
          <AccordionSection
            key={section.id}
            section={section}
            pathname={pathname}
            suppressRouteActiveHighlight={suppressRouteActiveHighlight}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Accordion section (group inside an expanded module) ──────────────────────

function AccordionSection({
  section,
  pathname,
  suppressRouteActiveHighlight,
}: {
  section: NavSection;
  pathname: string;
  suppressRouteActiveHighlight: boolean;
}) {
  return (
    <div>
      {section.label && (
        <p className="ml-10 mr-2 mt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          {section.label}
        </p>
      )}
      <ul className="mb-1 ml-10 space-y-0.5 pr-2">
        {section.children.map((child) => (
          <li key={child.to}>
            <AccordionItem
              child={child}
              suppressRouteActiveHighlight={suppressRouteActiveHighlight}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Individual accordion sub-item ───────────────────────────────────────────

function AccordionItem({
  child,
  suppressRouteActiveHighlight,
}: {
  child: NavChild;
  suppressRouteActiveHighlight: boolean;
}) {
  return (
    <NavLink
      to={child.to}
      end={child.end}
      className={({ isActive: routeActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          routeActive && !suppressRouteActiveHighlight
            ? "bg-blue-600 text-white font-medium"
            : "text-gray-400 hover:bg-gray-800 hover:text-white",
        )
      }
    >
      {({ isActive: routeActive }) => (
        <>
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              routeActive && !suppressRouteActiveHighlight
                ? "bg-white"
                : "bg-gray-600",
            )}
          />
          <span className="truncate">{child.label}</span>
        </>
      )}
    </NavLink>
  );
}
