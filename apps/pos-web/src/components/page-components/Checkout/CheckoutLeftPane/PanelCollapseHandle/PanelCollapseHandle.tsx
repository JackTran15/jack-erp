import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { cn } from "@erp/ui";
import {
  selectCatalogDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * Horizontal divider between the invoice table and the product catalog.
 * Click to toggle catalog visibility — đọc/set catalogCollapsed (per-tab) từ
 * session draft.
 */
export function PanelCollapseHandle() {
  const collapsed = usePosCheckoutSessionStore(
    (s) => selectCatalogDraft(s).catalogCollapsed,
  );
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );

  return (
    <button
      type="button"
      onClick={() =>
        updateDraftSlice("catalog", (c) => ({
          ...c,
          catalogCollapsed: !c.catalogCollapsed,
        }))
      }
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
