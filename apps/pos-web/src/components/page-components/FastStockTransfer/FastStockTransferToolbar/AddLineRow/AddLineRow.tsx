import { useEffect, useState } from "react";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
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
    searchCatalogProducts,
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

  // PosSearchPopover owns a string value; mirror the picked draft item's label
  // and keep it in sync when the draft is cleared/reset externally.
  const [carrierQuery, setCarrierQuery] = useState(
    toolbarDraft.carrier ? formatCarrierName(toolbarDraft.carrier) : "",
  );
  useEffect(() => {
    setCarrierQuery(
      toolbarDraft.carrier ? formatCarrierName(toolbarDraft.carrier) : "",
    );
  }, [toolbarDraft.carrier]);

  const [productQuery, setProductQuery] = useState(
    toolbarDraft.product
      ? `${toolbarDraft.product.code} — ${toolbarDraft.product.name}`
      : "",
  );
  useEffect(() => {
    setProductQuery(
      toolbarDraft.product
        ? `${toolbarDraft.product.code} — ${toolbarDraft.product.name}`
        : "",
    );
  }, [toolbarDraft.product]);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex w-1/4 min-w-[200px] items-center gap-2 pr-3 text-sm">
        <label className="w-1/3 shrink-0">Người vận chuyển</label>
        <div className="min-w-0 flex-1">
          <PosSearchPopover
            value={carrierQuery}
            onValueChange={setCarrierQuery}
            search={searchFastStockCarriers}
            onSelect={(c) => {
              handleToolbarDraftCarrier(c);
              setCarrierQuery(formatCarrierName(c));
            }}
            itemKey={(c) => c.id}
            renderItem={(c) => formatCarrierName(c)}
            placeholder="Chọn người vận chuyển"
            ariaLabel="Người vận chuyển"
            variant="boxed"
            minChars={0}
            containerClassName="w-full min-w-0"
          />
        </div>
      </div>
      <div className="flex w-1/4 min-w-0 items-center gap-2 pr-3 text-sm">
        <label className="w-1/3 shrink-0">Hàng hóa</label>
        <div className="min-w-0 flex-1">
          <PosSearchPopover
            value={productQuery}
            onValueChange={setProductQuery}
            search={searchCatalogProducts}
            onSelect={(p) => {
              handleToolbarDraftProduct(p);
              setProductQuery(`${p.code} — ${p.name}`);
            }}
            itemKey={(p) => p.itemId}
            renderItem={(p) => <span className="font-medium">{p.name}</span>}
            renderMeta={(p) =>
              `${p.code} · Tồn: ${formatOnHand(p.quantityOnHand, p.unit)}`
            }
            placeholder="SKU, tên, mã vạch"
            ariaLabel="Hàng hóa"
            variant="boxed"
            minChars={0}
            containerClassName="w-full min-w-0"
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
