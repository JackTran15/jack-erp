import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { cn } from "@erp/ui";
import { usePosCheckoutCatalogStore } from "@erp/pos/stores/page-stores/checkout/checkout-catalog.store";

/**
 * Horizontal divider between the invoice table and the product catalog.
 * Click to toggle catalog visibility — đọc/set catalogCollapsed từ store.
 */
export function PanelCollapseHandle() {
  const collapsed = usePosCheckoutCatalogStore((s) => s.catalogCollapsed);
  const setCatalogCollapsed = usePosCheckoutCatalogStore(
    (s) => s.setCatalogCollapsed,
  );

  return (
    <button
      type="button"
      onClick={() => setCatalogCollapsed((c) => !c)}
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
