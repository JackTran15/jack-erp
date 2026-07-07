import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Store } from "lucide-react";
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
import { resolvePosWebUrl } from "../../lib/pos-url";
import { getActiveBranch } from "../../lib/auth-storage";
import { useCurrentView } from "../../store/common/branch/branch.store";
import { useImportableTransferOrderCount } from "../../hooks/useImportableTransferOrderCount";

type NavBadgeCounts = Partial<
  Record<NonNullable<NavChild["badgeKey"]>, number>
>;

// ─── Root ─────────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useLayout();
  const view = useCurrentView();
  const filteredNav = visibleNavConfig(view);
  const transferInCountQuery = useImportableTransferOrderCount();
  const badgeCounts: NavBadgeCounts = {
    "importable-transfer-orders": transferInCountQuery.data ?? 0,
  };
  const activeModule =
    activeModuleFor(location.pathname, filteredNav) ?? filteredNav[0];

  const asideRef = useRef<HTMLElement>(null);
  const megaMenuPanelRef = useRef<HTMLDivElement>(null);

  // Start with all menu groups collapsed and no flyout shown.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [openFlyoutModuleId, setOpenFlyoutModuleId] = useState<string | null>(
    null,
  );

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
                badgeCounts={badgeCounts}
              />
            ))}
          </nav>
        </ScrollArea>

        <PosLaunchButton collapsed={sidebarCollapsed} />

        <Separator className="bg-gray-700" />

        <CollapseToggle collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Mega-menu panel — fixed overlay to the right of the sidebar */}
      {openFlyoutModule && (
        <MegaMenuPanel
          ref={megaMenuPanelRef}
          module={openFlyoutModule}
          onNavigate={() => setOpenFlyoutModuleId(null)}
        />
      )}
    </TooltipProvider>
  );
}

// ─── "Bán hàng" — switch to the POS app ───────────────────────────────────────

function PosLaunchButton({ collapsed }: { collapsed: boolean }) {
  const posUrl = resolvePosWebUrl();
  // Carry the active branch so POS opens on the same chi nhánh.
  const branchId = getActiveBranch();
  const href = posUrl
    ? branchId
      ? `${posUrl}?branchId=${encodeURIComponent(branchId)}`
      : posUrl
    : undefined;
  const link = (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "mx-2 mb-1 mt-2 flex h-10 items-center rounded-md bg-emerald-600 font-medium text-white transition-colors hover:bg-emerald-500",
        collapsed ? "justify-center" : "gap-2 px-3",
      )}
      aria-label="Bán hàng (mở POS)"
    >
      <Store className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="truncate text-sm">Bán hàng</span>}
    </a>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        Bán hàng (POS)
      </TooltipContent>
    </Tooltip>
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
  badgeCounts: NavBadgeCounts;
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
  badgeCounts,
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
          isFlyoutEnabled(module)
            ? () => onCollapsedFlyoutOpen(module.id)
            : undefined
        }
        badgeCounts={badgeCounts}
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
        badgeCounts={badgeCounts}
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
        badgeCounts={badgeCounts}
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
      badgeCounts={badgeCounts}
    />
  );
}

// ─── Collapsed: icon-only, tooltip, navigates to defaultPath ──────────────────

function CollapsedModuleRow({
  module,
  isActive,
  onFlyoutOpen,
  badgeCounts,
}: {
  module: NavModule;
  isActive: boolean;
  onFlyoutOpen?: () => void;
  badgeCounts: NavBadgeCounts;
}) {
  const navigate = useNavigate();
  const Icon = module.icon;
  const badgeCount = getModuleBadgeCount(module, badgeCounts);

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
            "relative flex h-10 w-full items-center justify-center rounded-md transition-colors",
            isActive
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-white",
          )}
          aria-label={module.label}
          aria-current={isActive ? "page" : undefined}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {badgeCount > 0 && (
            <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-red-600" />
          )}
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
  badgeCounts,
}: {
  module: NavModule;
  isActive: boolean;
  isFlyoutOpen: boolean;
  onToggleFlyout: () => void;
  badgeCounts: NavBadgeCounts;
}) {
  const Icon = module.icon;
  const badgeCount = getModuleBadgeCount(module, badgeCounts);

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
      <CountBadge count={badgeCount} />
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
  badgeCounts,
}: {
  module: NavModule;
  child: NavChild;
  suppressRouteActiveHighlight: boolean;
  badgeCounts: NavBadgeCounts;
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
      <NavItemBadge child={child} badgeCounts={badgeCounts} />
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
  badgeCounts: NavBadgeCounts;
}

function AccordionModuleRow({
  module,
  isActive,
  isOpen,
  onToggle,
  pathname,
  suppressRouteActiveHighlight,
  badgeCounts,
}: AccordionModuleRowProps) {
  const Icon = module.icon;
  const badgeCount = getModuleBadgeCount(module, badgeCounts);

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
          <CountBadge count={badgeCount} />
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
            badgeCounts={badgeCounts}
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
  badgeCounts,
}: {
  section: NavSection;
  pathname: string;
  suppressRouteActiveHighlight: boolean;
  badgeCounts: NavBadgeCounts;
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
              badgeCounts={badgeCounts}
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
  badgeCounts,
}: {
  child: NavChild;
  suppressRouteActiveHighlight: boolean;
  badgeCounts: NavBadgeCounts;
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
          <NavItemBadge child={child} badgeCounts={badgeCounts} />
        </>
      )}
    </NavLink>
  );
}

function NavItemBadge({
  child,
  badgeCounts,
}: {
  child: NavChild;
  badgeCounts: NavBadgeCounts;
}) {
  const count = child.badgeKey ? (badgeCounts[child.badgeKey] ?? 0) : 0;
  return <CountBadge count={count} className="ml-auto" />;
}

function CountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white",
        className,
      )}
    >
      {count}
    </span>
  );
}

function getModuleBadgeCount(module: NavModule, badgeCounts: NavBadgeCounts) {
  return module.sections
    .flatMap((section) => section.children)
    .reduce((sum, child) => {
      if (!child.badgeKey) return sum;
      return sum + (badgeCounts[child.badgeKey] ?? 0);
    }, 0);
}
