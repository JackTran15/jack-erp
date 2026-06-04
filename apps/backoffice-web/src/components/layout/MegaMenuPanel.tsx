import { forwardRef } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@erp/ui";
import { useLayout } from "./LayoutContext";
import type { NavModule, NavSection, NavChild } from "./navConfig";

export interface MegaMenuPanelProps {
  module: NavModule;
}

/** Chia section theo `flyout.splitLeft` / `flyout.splitRight` khi cả hai đều có. */
function splitFlyoutSections(
  module: NavModule,
): { left: NavSection[]; right: NavSection[] } | null {
  const left = module.flyout?.splitLeft;
  const right = module.flyout?.splitRight;
  if (!left || !right) return null;
  const byId = new Map(module.sections.map((s) => [s.id, s]));
  const pick = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((s): s is NavSection => s != null);
  return { left: pick(left), right: pick(right) };
}

/**
 * Flyout mega-menu panel rendered to the right of the sidebar for modules
 * with `flyout.enabled`. Displays sections as grouped columns with a dark
 * background matching the app header.
 *
 * Positioning is computed from the current sidebar width (collapsed vs expanded)
 * so that it always attaches flush to the sidebar edge.
 */
export const MegaMenuPanel = forwardRef<HTMLDivElement, MegaMenuPanelProps>(
  function MegaMenuPanel({ module }, ref) {
    const { sidebarCollapsed } = useLayout();
    const columnSplit = splitFlyoutSections(module);
    const hasSplitColumns = columnSplit != null;

    return (
      <div
        ref={ref}
        className={cn(
          "fixed top-14 z-[70] h-[calc(100vh-3.5rem)]",
          "w-max min-w-56 overflow-y-auto",
          "border-l border-gray-700 bg-gray-900 text-white shadow-2xl",
          "transition-[left] duration-200",
          sidebarCollapsed
            ? "left-[60px] max-w-[calc(100vw-60px)]"
            : "left-60 max-w-[calc(100vw-15rem)]",
        )}
      >
        <div className="p-5">
          <div
            className={cn(
              "grid items-start gap-x-5 gap-y-6",
              hasSplitColumns
                ? "grid-cols-[repeat(2,minmax(14rem,max-content))]"
                : "grid-cols-[minmax(14rem,max-content)]",
            )}
          >
            {columnSplit ? (
              <>
                <div className="flex min-w-0 flex-col gap-y-6">
                  {columnSplit.left.map((section) => (
                    <SectionColumn key={section.id} section={section} />
                  ))}
                </div>
                <div className="flex min-w-0 flex-col gap-y-6">
                  {columnSplit.right.map((section) => (
                    <SectionColumn key={section.id} section={section} />
                  ))}
                </div>
              </>
            ) : (
              module.sections.map((section) => (
                <SectionColumn key={section.id} section={section} />
              ))
            )}
          </div>
        </div>
      </div>
    );
  },
);

// ─── Section column ────────────────────────────────────────────────────────────

interface SectionColumnProps {
  section: NavSection;
}

function SectionColumn({ section }: SectionColumnProps) {
  return (
    <div className="min-w-0">
      {section.label && (
        <h3 className="mb-2 rounded px-2 py-1 text-[14px] font-bold uppercase tracking-widest text-gray-400 bg-gray-800">
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
      <span className="whitespace-normal">{child.label}</span>
    </NavLink>
  );
}
