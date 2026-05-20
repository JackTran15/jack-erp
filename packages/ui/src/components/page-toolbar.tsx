import type { ComponentType, ReactNode } from "react";
import { cn } from "../lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  /** Hover hint shown via native title attribute. Useful for disabled buttons. */
  tooltip?: string;
  /** "danger" renders the button in destructive color */
  variant?: "default" | "danger";
}

export interface ToolbarSeparator {
  id: string;
  type: "separator";
}

export type ToolbarItem = ToolbarAction | ToolbarSeparator;

export interface PageToolbarProps {
  items: ToolbarItem[];
  /** Slot rendered flush to the right (e.g. filters, date pickers) */
  trailing?: ReactNode;
  className?: string;
  tone?: "default" | "primary";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSeparator(item: ToolbarItem): item is ToolbarSeparator {
  return "type" in item && item.type === "separator";
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Horizontal action toolbar for pages that display a data table.
 * Place it at the top of the page content, above filters and the table.
 *
 * @example
 * <PageToolbar
 *   items={[
 *     { id: "add",    label: "Thêm mới", icon: Plus,   onClick: handleAdd },
 *     { id: "edit",   label: "Sửa",      icon: Pencil, onClick: handleEdit,   disabled: !selected },
 *     { id: "sep1",   type: "separator" },
 *     { id: "delete", label: "Xóa",      icon: Trash2, onClick: handleDelete, variant: "danger", disabled: !selected },
 *   ]}
 *   trailing={<SearchInput ... />}
 * />
 */
export function PageToolbar({
  items,
  trailing,
  className,
  tone = "default",
}: PageToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Hành động trang"
      className={cn(
        "flex items-center gap-0.5 border-b px-2 py-1",
        tone === "primary"
          ? "rounded-md border-[#1f2d8a] bg-[#1f2d8a] text-white"
          : "bg-white",
        className,
      )}
    >
      {items.map((item) => {
        if (isSeparator(item)) {
          return (
            <span
              key={item.id}
              role="separator"
              aria-orientation="vertical"
              className={cn(
                "mx-1.5 h-5 w-px shrink-0",
                tone === "primary" ? "bg-white/30" : "bg-border",
              )}
            />
          );
        }

        return <ToolbarButton key={item.id} action={item} tone={tone} />;
      })}

      {trailing && (
        <div className="ml-auto flex items-center gap-2 pl-2">{trailing}</div>
      )}
    </div>
  );
}

// ─── Sub-component: individual toolbar button ──────────────────────────────────

interface ToolbarButtonProps {
  action: ToolbarAction;
  tone: "default" | "primary";
}

function ToolbarButton({ action, tone }: ToolbarButtonProps) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.tooltip}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "primary"
          ? "disabled:pointer-events-none disabled:opacity-40"
          : "disabled:pointer-events-none disabled:opacity-40",
        tone === "primary"
          ? action.variant === "danger"
            ? "text-[#ffd6d6] hover:bg-white/10 hover:text-white"
            : "text-white hover:bg-white/10"
          : action.variant === "danger"
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-accent",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span>{action.label}</span>
    </button>
  );
}
