import { useEffect, type Ref } from "react";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferCarriers } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-carriers";
import { formatCarrierName } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import type { TempWarehousePublicUser } from "@erp/shared-interfaces";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export interface FastStockTransferCarrierSearchInputProps {
  disabled?: boolean;
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
  inputRef?: Ref<HTMLInputElement>;
  onAfterSelect?: () => void;
}

export function FastStockTransferCarrierSearchInput({
  disabled,
  placeholder = "Chọn người vận chuyển",
  minChars = 0,
  debounceMs = 150,
  inputRef,
  onAfterSelect,
}: FastStockTransferCarrierSearchInputProps) {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const {
    carriersLoading,
    carrierToolbar,
    setCarrierToolbar,
    carrierSearchAdapter,
  } = useFastStockTransferCarriers();
  const { handleToolbarDraftCarrier } = useFastStockTransferActions();

  useEffect(() => {
    setCarrierToolbar({
      query: toolbarDraft.carrier ? formatCarrierName(toolbarDraft.carrier) : "",
    });
  }, [toolbarDraft.carrier, setCarrierToolbar]);

  return (
    <PosSearchPopover<TempWarehousePublicUser>
      value={carrierToolbar.query}
      onValueChange={(q) => setCarrierToolbar({ query: q })}
      search={carrierSearchAdapter}
      onSelect={(c) => {
        handleToolbarDraftCarrier(c);
        setCarrierToolbar({ query: formatCarrierName(c) });
        onAfterSelect?.();
      }}
      onSubmitQuery={() => {
        if (toolbarDraft.carrier) {
          onAfterSelect?.();
          return true;
        }
        return false;
      }}
      onClear={() => {
        handleToolbarDraftCarrier(null);
        setCarrierToolbar({ query: "" });
      }}
      itemKey={(c) => c.id}
      renderItem={(c) => formatCarrierName(c)}
      placeholder={placeholder}
      ariaLabel="Người vận chuyển"
      variant="boxed"
      disabled={disabled || carriersLoading}
      minChars={minChars}
      debounceMs={debounceMs}
      containerClassName="w-full min-w-0"
      inputRef={inputRef}
    />
  );
}
