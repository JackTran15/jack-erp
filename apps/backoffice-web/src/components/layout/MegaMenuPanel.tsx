import { NavLink } from "react-router-dom";
import { cn } from "@erp/ui";
import { useLayout } from "./LayoutContext";
import type { NavModule, NavSection, NavChild } from "./navConfig";

interface MegaMenuPanelProps {
  module: NavModule;
}

/**
 * Flyout mega-menu panel rendered to the right of the sidebar for modules
 * with `flyout: true`. Displays sections as grouped columns with a dark
 * background matching the app header.
 *
 * Positioning is computed from the current sidebar width (collapsed vs expanded)
 * so that it always attaches flush to the sidebar edge.
 */
export function MegaMenuPanel({ module }: MegaMenuPanelProps) {
  const { sidebarCollapsed } = useLayout();

  return (
    <div
      className={cn(
        "fixed top-14 z-30 h-[calc(100vh-3.5rem)]",
        "w-[500px] overflow-y-auto",
        "border-l border-gray-700 bg-gray-900 text-white shadow-2xl",
        "transition-[left] duration-200",
        sidebarCollapsed ? "left-[60px]" : "left-60",
      )}
    >
      <div className="p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
          {module.label}
        </p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-6 items-start">
          {module.sections.map((section) => (
            <SectionColumn key={section.id} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section column ────────────────────────────────────────────────────────────

interface SectionColumnProps {
  section: NavSection;
}

function SectionColumn({ section }: SectionColumnProps) {
  return (
    <div>
      {section.label && (
        <h3 className="mb-2 rounded px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-gray-400 bg-gray-800">
          {section.label}
        </h3>
      )}
      <ul className="space-y-0.5">
        {section.children.map((child) => (
          <li key={child.to}>
            <MegaMenuLink child={child} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Individual link ──────────────────────────────────────────────────────────

interface MegaMenuLinkProps {
  child: NavChild;
}

function MegaMenuLink({ child }: MegaMenuLinkProps) {
  const Icon = child.icon;

  return (
    <NavLink
      to={child.to}
      end={child.end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-blue-600 text-white font-medium"
            : "text-gray-300 hover:bg-gray-800 hover:text-white",
        )
      }
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 opacity-75" />}
      <span>{child.label}</span>
    </NavLink>
  );
}
