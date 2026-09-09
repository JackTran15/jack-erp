import { useEffect, useRef } from "react";

import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutVariantSelection } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-variant-selection";
import { shouldAutoOpenVariant } from "@erp/pos/lib/page-libs/checkout/catalog-auto-open";

/**
 * Gõ ra đúng một card thì mở luôn dialog chọn biến thể — không cần Enter, không
 * cần click.
 *
 * Toàn bộ luật nằm ở `shouldAutoOpenVariant` (hàm thuần, có đặc tả riêng); hook
 * này chỉ giữ ô nhớ "từ khoá nào đã mở rồi" và gọi hàm mở.
 *
 * Ô nhớ **không** bị xoá khi người dùng đóng dialog. `total === 1` đúng liên tục
 * suốt thời gian từ khoá còn trên ô tìm, nên xoá là dialog bật lại ngay và không
 * thoát ra được. Muốn mở lại đúng từ khoá đó thì click vào card.
 */
export function useCheckoutCatalogAutoOpen(): void {
  const { catalogSearch, catalogTotal, catalogProducts } = useCheckoutCatalog();
  const { openForCatalogCard } = useCheckoutVariantSelection();
  const lastOpenedFor = useRef<string | null>(null);

  const card = catalogProducts[0];

  useEffect(() => {
    if (
      !shouldAutoOpenVariant({
        search: catalogSearch,
        total: catalogTotal,
        hasCard: Boolean(card),
        lastOpenedFor: lastOpenedFor.current,
      })
    ) {
      return;
    }
    lastOpenedFor.current = catalogSearch.trim();
    openForCatalogCard(card!);
  }, [catalogSearch, catalogTotal, card, openForCatalogCard]);
}
