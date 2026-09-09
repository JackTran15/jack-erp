import { useCallback, useEffect, type RefObject } from "react";
import {
  BarcodeIcon,
  ChevronDownIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import {
  PosSearchPopover,
  type SearchSuggestion,
} from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useCheckoutBarcodeAutoAdd } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-barcode-auto-add";
import { useCheckoutCartActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cart-actions";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import type { PosCatalogSuggestion } from "@erp/pos/interfaces/catalog.interface";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface ProductSearchInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  /** Catalog đang tải xong chưa — chặn input khi đang loading. */
  disabled?: boolean;
  /** Placeholder mặc định có hint phím tắt F3. */
  placeholder?: string;
  /**
   * Min ký tự để mở popover suggest. Mặc định 3 — đây là điều kiện kỹ thuật,
   * không phải tinh chỉnh UX: `pg_trgm` cần ≥3 ký tự mới tra được index, nên
   * chuỗi 1–2 ký tự quét toàn bộ catalog (đo 54,7 ms cho `%2%` kể cả đã LIMIT).
   * Quét mã vạch KHÔNG bị ảnh hưởng: đường Enter (`onSubmitQuery`) không đi qua
   * ngưỡng này.
   */
  minChars?: number;
  /** Debounce ms cho input. */
  debounceMs?: number;
}

/**
 * Toolbar product search (concrete cho PosCatalogLine):
 *  [ Tìm kiếm ▾ ] [ (F3) Nhập tên hàng hóa, mã vạch, mã SKU ........ ] [⎮ barcode]
 *
 * Đọc query từ catalog store, gọi cart-actions hook để thêm sản phẩm.
 * Lắng nghe `productSearchFocusSeq` từ ui store để auto-focus khi user
 * commit qty.
 */
export function ProductSearchInput({
  inputRef,
  disabled,
  placeholder = "(F3) Nhập tên hàng hóa, mã vạch, mã SKU",
  minChars = 3,
  debounceMs = 150,
}: ProductSearchInputProps) {
  const { toolbar, setToolbar } = useCheckoutCatalog();
  const { addProductByItem, addProductByQuery } = useCheckoutCartActions();
  const { tryAutoAdd, searchWithAutoAdd, resetGuard } =
    useCheckoutBarcodeAutoAdd();
  const focusSeq = usePosCheckoutUiStore((s) => s.productSearchFocusSeq);

  useEffect(() => {
    // Trên reload trang, catalog chưa load xong nên input còn `disabled` khi
    // signal focus đầu tiên bắn ra — input disabled không nhận focus được.
    // Gate theo `disabled` để effect tự retry khi catalog load xong.
    if (focusSeq === 0 || disabled) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq, disabled, inputRef]);

  // Mỗi lần gõ/quét thật mở một phiên nhập mới (nhả guard khử trùng).
  const handleValueChange = useCallback(
    (q: string) => {
      resetGuard();
      setToolbar((s) => ({ ...s, query: q }));
    },
    [resetGuard, setToolbar],
  );

  // "Đổi input": MỘT request trả cả khớp tuyệt đối lẫn gợi ý. Khớp mã vạch/SKU
  // 100% → auto-add và dropdown đóng (suggestions rỗng); không khớp → gợi ý
  // server-side như cũ. Trước đây chỗ này bắn hai request nối tiếp.
  const search = useCallback(
    async (q: string): Promise<SearchSuggestion<PosCatalogSuggestion>[]> => {
      const { suggestions } = await searchWithAutoAdd(q);
      return suggestions.slice(0, 8).map((item) => ({ item }));
    },
    [searchWithAutoAdd],
  );

  // Enter: tra trước; khớp 1 → đã add; chỉ khi không khớp mới giữ addProductByQuery cũ.
  const handleSubmitQuery = useCallback(
    (q: string): boolean => {
      if (!q.trim()) return true;
      void tryAutoAdd(q).then((result) => {
        if (result === "miss") void addProductByQuery();
      });
      return true;
    },
    [tryAutoAdd, addProductByQuery],
  );

  return (
    <PosSearchPopover<PosCatalogSuggestion>
      inputRef={inputRef}
      value={toolbar.query}
      onValueChange={handleValueChange}
      search={search}
      onSelect={(item) => addProductByItem(item)}
      itemKey={(item) => item.itemId}
      renderItem={(item) => item.name}
      renderMeta={(item) => `${item.code} · ${item.unit}`}
      onSubmitQuery={handleSubmitQuery}
      placeholder={placeholder}
      disabled={disabled}
      minChars={minChars}
      debounceMs={debounceMs}
      containerClassName="flex h-9 flex-1 items-stretch overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
      inputClassName="min-w-0 flex-1 bg-transparent px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
      prefix={
        <button
          type="button"
          className="flex h-full shrink-0 items-center gap-1 border-r border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-700 hover:bg-gray-100"
        >
          Tìm kiếm
          <ChevronDownIcon size={14} className="text-gray-400" />
        </button>
      }
      suffix={
        <PosIconButton
          ariaLabel="Quét mã vạch"
          icon={<BarcodeIcon size={18} />}
          className="h-full w-9 rounded-none"
        />
      }
    />
  );
}
