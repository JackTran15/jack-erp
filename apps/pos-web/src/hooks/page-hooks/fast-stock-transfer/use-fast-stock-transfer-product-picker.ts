import { useCallback, useMemo } from "react";

import {
  POS_CATALOG_QUERY_LIMIT,
  useLookupCatalogByCode,
  useSearchCatalog,
} from "@erp/pos/hooks/react-query/use-query-catalog";
import { matchesCatalogQuery } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";

const PRODUCT_QUERY_MIN_CHARS = 1;

type Updater<T> = T | ((prev: T) => T);

interface ProductToolbarState {
  query: string;
}

interface UseFastStockTransferProductPickerResult {
  productToolbar: ProductToolbarState;
  setProductToolbar: (value: Updater<ProductToolbarState>) => void;
  /**
   * Tra ứng viên cho một chuỗi: khớp tuyệt đối mã vạch/SKU trước, trượt mới rơi
   * về `catalog?search` ILIKE. Chỉ trả dữ liệu — việc chọn hàng do popover hoặc
   * đường Enter quyết định (ADR-03), nên hàm này không tự gọi callback nào.
   */
  resolveCandidates: (q: string) => Promise<PosCatalogLine[]>;
  findProduct: (itemId: string) => PosCatalogLine | null;
}

export function useFastStockTransferProductPicker(): UseFastStockTransferProductPickerResult {
  const branchId = usePosBranchStore((s) => s.branchId);
  const lookup = useLookupCatalogByCode();
  const searchCatalog = useSearchCatalog();

  const productToolbar = usePosFastStockTransferPickerStore(
    (s) => s.productToolbar,
  );
  const setProductToolbar = usePosFastStockTransferPickerStore(
    (s) => s.setProductToolbar,
  );
  const upsertProducts = usePosFastStockTransferPickerStore(
    (s) => s.upsertProducts,
  );
  const findProduct = usePosFastStockTransferPickerStore((s) => s.findProduct);

  const searchByText = useCallback(
    async (q: string): Promise<PosCatalogLine[]> => {
      const normalized = q.trim();
      if (normalized.length < PRODUCT_QUERY_MIN_CHARS || !branchId) {
        return [];
      }

      // Chuyển kho tạm cần thấy cả chi tiết đã ngừng theo dõi để dọn hàng.
      const rows = await searchCatalog(branchId, normalized, true);
      upsertProducts(rows);

      return rows
        .filter((p) => matchesCatalogQuery(p, normalized))
        .slice(0, POS_CATALOG_QUERY_LIMIT);
    },
    [branchId, searchCatalog, upsertProducts],
  );

  const resolveCandidates = useCallback(
    async (q: string): Promise<PosCatalogLine[]> => {
      const code = q.trim();
      if (code.length < PRODUCT_QUERY_MIN_CHARS || !branchId) {
        return [];
      }

      let lookupRows: PosCatalogLine[];
      try {
        lookupRows = await lookup(branchId, code, true);
      } catch {
        lookupRows = [];
      }

      if (lookupRows.length > 0) {
        upsertProducts(lookupRows);
        return lookupRows;
      }

      return searchByText(q);
    },
    [branchId, lookup, searchByText, upsertProducts],
  );

  return useMemo(
    () => ({
      productToolbar,
      setProductToolbar,
      resolveCandidates,
      findProduct,
    }),
    [productToolbar, setProductToolbar, resolveCandidates, findProduct],
  );
}
