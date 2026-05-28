import { useEffect } from "react";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferProductPicker } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-product-picker";
import { formatOnHand } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export interface FastStockTransferProductSearchInputProps {
  disabled?: boolean;
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
}

export function FastStockTransferProductSearchInput({
  disabled,
  placeholder = "SKU, tên, mã vạch",
  minChars = 1,
  debounceMs = 150,
}: FastStockTransferProductSearchInputProps) {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const { productToolbar, setProductToolbar, productSearchAdapter } =
    useFastStockTransferProductPicker();
  const { handleToolbarDraftProduct } = useFastStockTransferActions();

  useEffect(() => {
    setProductToolbar({
      query: toolbarDraft.product
        ? `${toolbarDraft.product.code} — ${toolbarDraft.product.name}`
        : "",
    });
  }, [toolbarDraft.product, setProductToolbar]);

  return (
    <PosSearchPopover<PosCatalogLine>
      value={productToolbar.query}
      onValueChange={(q) => setProductToolbar({ query: q })}
      search={productSearchAdapter}
      onSelect={(p) => {
        handleToolbarDraftProduct(p);
        setProductToolbar({ query: `${p.code} — ${p.name}` });
      }}
      itemKey={(p) => p.itemId}
      renderItem={(p) => <span className="font-medium">{p.name}</span>}
      renderMeta={(p) =>
        `${p.code} · Tồn: ${formatOnHand(p.quantityOnHand, p.unit)}`
      }
      placeholder={placeholder}
      ariaLabel="Hàng hóa"
      variant="boxed"
      disabled={disabled}
      minChars={minChars}
      debounceMs={debounceMs}
      containerClassName="w-full min-w-0"
    />
  );
}
