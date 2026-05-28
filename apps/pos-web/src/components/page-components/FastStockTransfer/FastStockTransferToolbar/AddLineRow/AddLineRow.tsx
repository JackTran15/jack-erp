import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { FastStockTransferCarrierSearchInput } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/AddLineRow/FastStockTransferCarrierSearchInput/FastStockTransferCarrierSearchInput";
import { FastStockTransferProductSearchInput } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/AddLineRow/FastStockTransferProductSearchInput/FastStockTransferProductSearchInput";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import {
  catalogLocationName,
  catalogLocationsForLine,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-pickers";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export function AddLineRow() {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const { isSessionClosed, isMutating } = useFastStockTransferData();
  const { handleToolbarDraftLocation, handleAddRow } =
    useFastStockTransferActions();

  const locationItems = toolbarDraft.product
    ? catalogLocationsForLine(toolbarDraft.product)
    : [];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex w-1/4 min-w-[200px] items-center gap-2 pr-3 text-sm">
        <label className="w-1/3 shrink-0">Người vận chuyển</label>
        <div className="min-w-0 flex-1">
          <FastStockTransferCarrierSearchInput
            disabled={isSessionClosed || isMutating}
          />
        </div>
      </div>
      <div className="flex w-1/4 min-w-0 items-center gap-2 pr-3 text-sm">
        <label className="w-1/3 shrink-0">Hàng hóa</label>
        <div className="min-w-0 flex-1">
          <FastStockTransferProductSearchInput
            disabled={isSessionClosed || isMutating}
          />
        </div>
      </div>
      <div className="flex w-1/6 min-w-0 items-center gap-2 text-sm">
        <label className="w-1/5 shrink-0">Vị trí</label>
        <div className="min-w-0 flex-1">
          <PosSelect
            value={toolbarDraft.location}
            onChange={handleToolbarDraftLocation}
            items={locationItems}
            itemKey={(l) => l.locationId}
            renderItem={(l) => catalogLocationName(l)}
            variant="boxed"
            disabled
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleAddRow}
        disabled={isSessionClosed || isMutating}
        className="inline-flex h-9 shrink-0 items-center rounded-md border border-[#4F46E5] px-6 text-[13px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
      >
        Thêm
      </button>
    </div>
  );
}
