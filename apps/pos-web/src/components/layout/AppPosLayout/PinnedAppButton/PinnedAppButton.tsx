import { cn } from "@erp/ui";
import type { AppMenuItem } from "@erp/pos/components/layout/AppPosLayout/AppPosLayout";

export interface PinnedAppButtonProps {
  item: AppMenuItem;
  active?: boolean;
  onClick?: () => void;
}

/**
 * Compact app launcher icon shown next to {@link SapoLogo} in the topbar.
 * Mirrors the AppSwitcher cluster from `task/PinButton_description.md` §4.1:
 * a colored squircle with a centered white glyph, scaled to fit the existing
 * 44px topbar.
 */
export function PinnedAppButton({
  item,
  active,
  onClick,
}: PinnedAppButtonProps) {
  const { label, Icon, iconBgColor } = item;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Mở ${label}`}
      aria-current={active ? "page" : undefined}
      style={{ backgroundColor: iconBgColor }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-transform",
        "hover:scale-105 hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]",
        "active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5AFE]/60 focus-visible:ring-offset-1",
      )}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}
