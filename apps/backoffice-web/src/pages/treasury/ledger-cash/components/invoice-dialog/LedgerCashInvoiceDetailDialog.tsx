import { Button } from "@erp/ui";
import { CloudUpload, X } from "lucide-react";
import { toast } from "sonner";
import { FormShellDialog } from "../../../../../components/form-shell-dialog";
import { LedgerCashInvoiceKindEnum } from "../../ledger-cash.types";
import type { LedgerCashInvoiceDetail } from "../../ledger-cash.types";
import { InvoiceDetailInfoGrid } from "./InvoiceDetailInfoGrid";
import { InvoiceLinesTable } from "./InvoiceLinesTable";
import { InvoicePaymentSummary } from "./InvoicePaymentSummary";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: LedgerCashInvoiceDetail | null;
}

export function LedgerCashInvoiceDetailDialog({
  open,
  onOpenChange,
  detail,
}: Props) {
  if (!detail) return null;

  const isReturn = detail.kind === LedgerCashInvoiceKindEnum.RETURN;
  const titleLabel = isReturn ? "HÓA ĐƠN ĐỔI TRẢ" : "HÓA ĐƠN THANH TOÁN";

  return (
    <FormShellDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Chi tiết hóa đơn"
      defaultWidth={960}
      defaultHeight={640}
      minWidth={720}
      minHeight={480}
      showFooter
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Tính năng xuất khẩu sẽ được bổ sung.")}
          >
            <CloudUpload className="mr-1.5 h-4 w-4" />
            Xuất khẩu
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-4 w-4" />
            Đóng
          </Button>
        </div>
      }
    >
      <FormShellDialog.Body>
        <FormShellDialog.Slot>
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
            {titleLabel}
          </p>
        </FormShellDialog.Slot>

        <FormShellDialog.Slot>
          <InvoiceDetailInfoGrid detail={detail} />
        </FormShellDialog.Slot>

        <FormShellDialog.DetailRegion>
          <FormShellDialog.ScrollPane>
            <InvoiceLinesTable detail={detail} />
          </FormShellDialog.ScrollPane>
        </FormShellDialog.DetailRegion>

        <FormShellDialog.Slot>
          <InvoicePaymentSummary detail={detail} />
        </FormShellDialog.Slot>
      </FormShellDialog.Body>
    </FormShellDialog>
  );
}
