import { useCallback, useEffect, type Ref } from "react";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferProductPicker } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-product-picker";
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
  onAfterSelect?: () => void;
}

export function FastStockTransferProductSearchInput({
  disabled,
  placeholder = "SKU, tên, mã vạch",
  minChars = 1,
  debounceMs = 150,
  inputRef,
  onAfterSelect,
}: FastStockTransferProductSearchInputProps) {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const {
    productToolbar,
    setProductToolbar,
    productHybridAdapter,
    resetLookupGuard,
  } = useFastStockTransferProductPicker();
  const { handleToolbarDraftProduct } = useFastStockTransferActions();

  useEffect(() => {
    setProductToolbar({
      query: toolbarDraft.product
        ? baseProductName(toolbarDraft.product.name)
        : "",
    });
  }, [toolbarDraft.product, setProductToolbar]);

  const selectProduct = useCallback(
    (p: PosCatalogLine) => {
      handleToolbarDraftProduct(p);
      setProductToolbar({ query: baseProductName(p.name) });
      onAfterSelect?.();
    },
    [handleToolbarDraftProduct, onAfterSelect, setProductToolbar],
  );

  const handleValueChange = useCallback(
    (q: string) => {
      resetLookupGuard();
      setProductToolbar({ query: q });
    },
    [resetLookupGuard, setProductToolbar],
  );

  const search = useCallback(
    (q: string) => productHybridAdapter(q, selectProduct),
    [productHybridAdapter, selectProduct],
  );

  const handleSubmitQuery = useCallback(
    (q: string): boolean => {
      if (q.trim()) {
        void productHybridAdapter(q, selectProduct);
      }
      if (toolbarDraft.product) {
        onAfterSelect?.();
        return true;
      }
      return false;
    },
    [productHybridAdapter, selectProduct, toolbarDraft.product, onAfterSelect],
  );

  return (
    <PosSearchPopover<PosCatalogLine>
      value={productToolbar.query}
      onValueChange={handleValueChange}
      search={search}
      onSelect={selectProduct}
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
      containerClassName="w-full min-w-0"
      inputRef={inputRef}
    />
  );
}
