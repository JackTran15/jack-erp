import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import { PosDateRangeFilter } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter";
import { ExchangeClipboardIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ReturnInvoiceTable } from "@erp/pos/components/page-components/ReturnGoods/ReturnInvoiceTable/ReturnInvoiceTable";
import { ReturnItemsDialog } from "@erp/pos/components/page-components/ReturnGoods/ReturnItemsDialog/ReturnItemsDialog";
import { RETURN_GOODS_DEFAULT_PAGE_SIZE } from "@erp/pos/constants/return-goods.constant";
import { useReturnGoods } from "@erp/pos/hooks/page-hooks/return-goods/use-return-goods";

export function ReturnGoodsPage() {
  const navigate = useNavigate();
  const enterQuickExchange = usePosCheckoutSessionStore(
    (s) => s.enterQuickExchange,
  );
  const branchName = usePosBranchStore((s) => s.branchName) ?? "—";
  const [pageDate] = useState(() => new Date());
  const {
    dateRange,
    setDateRange,
    filters,
    setFilter,
    rows,
    dialog,
    openInvoice,
    closeDialog,
    toggleItem,
    toggleAllItems,
    setReturnQty,
    confirmReturn,
  } = useReturnGoods();

  const dateLabel = formatViDateTime(pageDate, { separator: "space" }).split(
    " ",
  )[0]!;

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PosDateRangeFilter value={dateRange} onChange={setDateRange} />
            <span className="text-[14px] text-[#1F2233]">{dateLabel}</span>
          </div>

          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#F59E0B] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#D97706] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCD34D] focus-visible:ring-offset-2"
            onClick={() => {
              enterQuickExchange();
              navigate("/");
            }}
          >
            <ExchangeClipboardIcon size={16} strokeWidth={1.75} />
            Đổi trả nhanh
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white">
          <div className="min-h-0 flex-1">
            <ReturnInvoiceTable
              rows={rows}
              filters={filters}
              onFilterChange={setFilter}
              onReturn={openInvoice}
            />
          </div>

          <PosPaginationBar
            page={1}
            totalPages={1}
            pageSize={RETURN_GOODS_DEFAULT_PAGE_SIZE}
            total={rows.length}
          />
        </div>
      </div>

      <ReturnItemsDialog
        open={dialog.open}
        invoice={dialog.invoice}
        items={dialog.items}
        loading={dialog.loading}
        selectedIds={dialog.selectedIds}
        qtyById={dialog.qtyById}
        onToggleItem={toggleItem}
        onToggleAll={toggleAllItems}
        onChangeQty={setReturnQty}
        onConfirm={confirmReturn}
        onClose={closeDialog}
      />
    </div>
  );
}
