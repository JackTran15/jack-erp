import { cn } from "@erp/ui";
import type { DraftInvoice } from "@erp/pos/interfaces/checkout.interface";
import { DraftRow } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/InvoiceListPanel/DraftRow/DraftRow";

interface InvoiceListPanelProps {
  drafts: DraftInvoice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function InvoiceListPanel({
  drafts,
  selectedId,
  onSelect,
  onDelete,
}: InvoiceListPanelProps) {
  return (
    <div
      role="region"
      aria-label="Danh sách hóa đơn"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#E6E8EE] bg-white",
        "shadow-[0_1px_2px_rgba(15,20,36,0.04)]",
      )}
    >
      <div
        className={cn(
          "grid items-center bg-[#F7F8FA] px-4 py-3 text-[14px] font-semibold text-[#4B5163]",
          "grid-cols-[1.2fr_1fr_1fr_1.3fr_24px] gap-4",
        )}
        role="row"
      >
        <div role="columnheader">Số hóa đơn</div>
        <div role="columnheader">Tên khách hàng</div>
        <div role="columnheader">Số điện thoại</div>
        <div role="columnheader">Thời gian tạo</div>
        <span aria-hidden="true" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <p className="px-4 py-12 text-center text-[14px] italic text-[#9CA0AB]">
            Chưa có hóa đơn lưu tạm
          </p>
        ) : (
          drafts.map((draft) => (
            <DraftRow
              key={draft.id}
              draft={draft}
              selected={draft.id === selectedId}
              onSelect={() => onSelect(draft.id)}
              onDelete={
                onDelete
                  ? (e) => {
                      e.stopPropagation();
                      onDelete(draft.id);
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
