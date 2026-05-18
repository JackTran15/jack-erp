import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosSelectSearch } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import { formatOnHand } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  catalogLocationName,
  catalogLocationsForLine,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-pickers";
import { formatCarrierName } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export function AddLineRow() {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const {
    isSessionClosed,
    isMutating,
    searchFastStockCarriers,
    handleCarrierQueryChange,
    searchCatalogProducts,
    handleCatalogQueryChange,
  } = useFastStockTransferData();
  const {
    handleToolbarDraftCarrier,
    handleToolbarDraftProduct,
    handleToolbarDraftLocation,
    handleAddRow,
  } = useFastStockTransferActions();

  const locationItems = toolbarDraft.product
    ? catalogLocationsForLine(toolbarDraft.product)
    : [];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <PosFormItem
        label="Người vận chuyển"
        layout="horizontal"
        className="w-1/4 min-w-[200px] pr-3"
        labelClassName="w-1/3"
      >
        <PosSelectSearch
          className="w-full min-w-0"
          value={toolbarDraft.carrier}
          onChange={handleToolbarDraftCarrier}
          search={searchFastStockCarriers}
          onQueryChange={handleCarrierQueryChange}
          itemKey={(c) => c.id}
          renderItem={(c) => formatCarrierName(c)}
          renderSelected={(c) => formatCarrierName(c)}
          placeholder="Chọn người vận chuyển"
          ariaLabel="Người vận chuyển"
        />
      </PosFormItem>
      <PosFormItem
        label="Hàng hóa"
        layout="horizontal"
        className="w-1/4 pr-3"
        labelClassName="w-1/3"
      >
        <PosSelectSearch
          className="w-full min-w-0"
          value={toolbarDraft.product}
          onChange={handleToolbarDraftProduct}
          search={searchCatalogProducts}
          onQueryChange={handleCatalogQueryChange}
          itemKey={(p) => p.itemId}
          renderItem={(p) => <span className="font-medium">{p.name}</span>}
          renderMeta={(p) =>
            `${p.code} · Tồn: ${formatOnHand(p.quantityOnHand, p.unit)}`
          }
          renderSelected={(p) => `${p.code} — ${p.name}`}
          placeholder="SKU, tên, mã vạch"
          ariaLabel="Hàng hóa"
          menuClassName="min-w-[320px]"
        />
      </PosFormItem>
      <PosFormItem
        label="Vị trí"
        layout="horizontal"
        className="min-w-0 w-1/6"
        labelClassName="w-1/5"
      >
        <PosSelect
          value={toolbarDraft.location}
          onChange={handleToolbarDraftLocation}
          items={locationItems}
          itemKey={(l) => l.locationId}
          renderItem={(l) => catalogLocationName(l)}
          variant="boxed"
          disabled
        />
      </PosFormItem>
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
