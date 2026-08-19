import { useCallback, useEffect, useRef, type Ref } from "react";
import {
  PosSearchPopover,
  type PosSearchPopoverHandle,
} from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferProductPicker } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-product-picker";
import { decideScanOutcome } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-scan-resolve";
import { formatVnd } from "@erp/ui";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

/**
 * Tên hàng hóa hiển thị = tên SKU bỏ hậu tố biến thể ở cuối, vd
 * "Giày nam ABA2777 (D/38)" → "Giày nam ABA2777". `products.name` không dùng
 * được vì dữ liệu hiện lưu = mã SKU gốc ("ABA2777").
 */
function baseProductName(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim();
}

export interface FastStockTransferProductSearchInputProps {
  disabled?: boolean;
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
  inputRef?: Ref<HTMLInputElement>;
  /** Dòng đã được thêm vào bảng. */
  onAdded?: () => void;
  /** Không thêm được vì chưa chọn người vận chuyển. */
  onMissingCarrier?: () => void;
}

export function FastStockTransferProductSearchInput({
  disabled,
  placeholder = "SKU, tên, mã vạch",
  minChars = 1,
  debounceMs = 150,
  inputRef,
  onAdded,
  onMissingCarrier,
}: FastStockTransferProductSearchInputProps) {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const { productToolbar, setProductToolbar, resolveCandidates } =
    useFastStockTransferProductPicker();
  const { handleToolbarDraftProduct, handleAddRow } =
    useFastStockTransferActions();
  const popoverRef = useRef<PosSearchPopoverHandle>(null);

  useEffect(() => {
    setProductToolbar({
      query: toolbarDraft.product
        ? baseProductName(toolbarDraft.product.name)
        : "",
    });
  }, [toolbarDraft.product, setProductToolbar]);

  /**
   * Chọn hàng rồi thêm dòng ngay — một đường duy nhất cho cả click gợi ý, Enter
   * trên dòng đang nổi, và Enter sau khi máy quét bắn mã (ADR-04).
   * `handleAddRow` đọc draft bằng `getState()` nên không cần chờ React render lại.
   */
  const selectAndAdd = useCallback(
    async (p: PosCatalogLine) => {
      handleToolbarDraftProduct(p);
      setProductToolbar({ query: baseProductName(p.name) });
      // Đường tự chọn không đi qua `selectItem` của popover, nên phải tự đóng —
      // nếu không, popover ở lại với danh sách rỗng và hiện "Không có kết quả.".
      popoverRef.current?.close();
      await handleAddRow({ onAdded, onMissingCarrier });
    },
    [
      handleAddRow,
      handleToolbarDraftProduct,
      onAdded,
      onMissingCarrier,
      setProductToolbar,
    ],
  );

  const handleValueChange = useCallback(
    (q: string) => {
      setProductToolbar({ query: q });
    },
    [setProductToolbar],
  );

  const search = useCallback(
    async (q: string) => {
      const rows = await resolveCandidates(q);
      return rows.map((item) => ({ item }));
    },
    [resolveCandidates],
  );

  const handleSubmitQuery = useCallback(
    (q: string): boolean => {
      if (!q.trim()) return false;
      void resolveCandidates(q).then((candidates) => {
        // `highlighted: null` — nhánh này chỉ chạy khi popover chưa có dòng nào
        // đang nổi; có dòng nổi thì popover đã tự gọi `onSelect` rồi.
        const outcome = decideScanOutcome({
          highlighted: null,
          query: q,
          candidates,
        });
        if (outcome.kind === "add") void selectAndAdd(outcome.product);
      });
      return true;
    },
    [resolveCandidates, selectAndAdd],
  );

  return (
    <PosSearchPopover<PosCatalogLine>
      value={productToolbar.query}
      onValueChange={handleValueChange}
      search={search}
      onSelect={(p) => void selectAndAdd(p)}
      onSubmitQuery={handleSubmitQuery}
      onClear={() => {
        handleToolbarDraftProduct(null);
        setProductToolbar({ query: "" });
      }}
      itemKey={(p) => p.itemId}
      renderItem={(p) => (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">
            {baseProductName(p.name)} · {p.unit}
          </span>
          <span className="font-medium">{formatVnd(p.sellingPrice)}</span>
        </div>
      )}
      renderMeta={(p) => (
        <div className="flex items-center justify-between gap-2">
          <span>{p.code}</span>
          <span>{p.code}</span>
        </div>
      )}
      placeholder={placeholder}
      ariaLabel="Hàng hóa"
      variant="boxed"
      disabled={disabled}
      minChars={minChars}
      debounceMs={debounceMs}
      autoHighlightFirst
      containerClassName="w-full min-w-0"
      inputRef={inputRef}
      popoverRef={popoverRef}
    />
  );
}
