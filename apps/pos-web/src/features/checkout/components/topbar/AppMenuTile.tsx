import type { ComponentType } from "react";
import { cn } from "@erp/ui";
import type { IconProps } from "../icons/Icon";

export interface AppMenuTileProps {
  label: string;
  Icon: ComponentType<IconProps>;
  /** Squircle background fill. */
  iconBgColor: string;
  selected?: boolean;
  /** Pill text shown overlapping the bottom-right of the icon. */
  badge?: string;
  onClick: () => void;
}

/**
 * One launcher tile in the POS application menu.
 *
 * Default variant: transparent wrapper, 80×80 colored squircle, label below.
 * Selected variant: light-periwinkle pill background + 3px top accent bar +
 *   bold label (matches the spec "Bán hàng" tile).
 * Optional `badge` overlays a red pill at the bottom-right of the squircle.
 */
export function AppMenuTile({
  label,
  Icon,
  iconBgColor,
  selected,
  badge,
  onClick,
}: AppMenuTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "group relative flex flex-col items-center gap-4 rounded-2xl p-3 transition-transform",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5AFE]/60 focus-visible:ring-offset-2",
        "active:scale-95",
        selected ? "bg-[#EEF1FE]" : "hover:bg-gray-50",
      )}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute left-2 right-2 top-0 h-[3px] rounded-[2px] bg-[#3D5AFE]"
        />
      )}
      <span
        className="relative flex h-[44px] w-[44px] items-center justify-center rounded-[18px] text-white shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition-shadow group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
        style={{ backgroundColor: iconBgColor }}
      >
        <Icon size={24} strokeWidth={1.75} />
        {badge && (
          <span
            aria-label="Tính năng mới"
            className="absolute -bottom-2 -right-1 rounded-full bg-[#FF5A5F] px-2 py-[2px] text-[11px] font-semibold leading-none text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
          >
            {badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-center text-[14px]",
          selected ? "font-bold text-[#0F172A]" : "font-normal text-[#1F2937]",
        )}
      >
        {label}
      </span>
    </button>
  );
}
