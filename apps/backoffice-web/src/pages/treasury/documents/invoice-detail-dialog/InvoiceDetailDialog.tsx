import { AppModal, Button, PageToolbar, type ToolbarItem } from "@erp/ui";
import { CloudUpload, X } from "lucide-react";
import { toast } from "sonner";
import { LedgerCashInvoiceKindEnum } from "../../ledger-cash/ledger-cash.types";
import type { LedgerCashInvoiceDetail } from "../../ledger-cash/ledger-cash.types";
import { InvoiceDetailInfoGrid } from "./InvoiceDetailInfoGrid";
import { InvoiceLinesTable } from "./InvoiceLinesTable";
import { InvoicePaymentSummary } from "./InvoicePaymentSummary";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: LedgerCashInvoiceDetail | null;
}

export function InvoiceDetailDialog({
  open,
  onOpenChange,
  detail,
}: Props) {
  if (!detail) return null;

  const isReturn = detail.kind === LedgerCashInvoiceKindEnum.RETURN;
  const titleLabel = isReturn ? "HÓA ĐƠN ĐỔI TRẢ" : "HÓA ĐƠN THANH TOÁN";

  const toolbarItems: ToolbarItem[] = [
    {
      id: "close",
      label: "Đóng",
      icon: X,
      onClick: () => onOpenChange(false),
    },
  ];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Chi tiết hóa đơn"
      defaultWidth={960}
      defaultHeight={640}
      minWidth={720}
      minHeight={480}
      showFooter={false}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <PageToolbar tone="primary" items={toolbarItems} className="rounded-none" />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
            {titleLabel}
          </p>
          <InvoiceDetailInfoGrid detail={detail} />
          <InvoiceLinesTable detail={detail} />
          <InvoicePaymentSummary detail={detail} />
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info("Tính năng xuất khẩu sẽ được bổ sung.")
              }
            >
              <CloudUpload className="mr-1.5 h-4 w-4" />
              Xuất khẩu
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              <X className="mr-1.5 h-4 w-4" />
              Đóng
            </Button>
          </div>
        </div>
      </div>
    </AppModal>
  );
}
