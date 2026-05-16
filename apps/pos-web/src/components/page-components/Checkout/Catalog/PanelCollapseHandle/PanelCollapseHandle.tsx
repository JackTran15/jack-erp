import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { cn } from "@erp/ui";

export interface PanelCollapseHandleProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Horizontal divider between the invoice table and the product catalog.
 * Click to toggle catalog visibility (resize support omitted — pure UI).
 */
export function PanelCollapseHandle({
  collapsed,
  onToggle,
}: PanelCollapseHandleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "Mở rộng tư vấn bán hàng" : "Thu gọn tư vấn bán hàng"}
      aria-expanded={!collapsed}
      className="flex h-6 w-full cursor-pointer items-center justify-center border-y border-gray-200 bg-gray-100 transition-colors hover:bg-gray-200"
    >
      <ChevronDownIcon
        size={14}
        className={cn(
          "text-gray-400 transition-transform",
          collapsed && "rotate-180",
        )}
      />
    </button>
  );
}
