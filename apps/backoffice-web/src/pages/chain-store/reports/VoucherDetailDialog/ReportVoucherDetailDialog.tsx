import { useMemo } from "react";
import { createPortal } from "react-dom";
import { AppModal, Button } from "@erp/ui";
import { Loader2, X } from "lucide-react";
import { useBankPayment } from "../../../../hooks/treasury/use-bank-payments";
import { useBankReceipt } from "../../../../hooks/treasury/use-bank-receipts";
import { useCashPayment } from "../../../../hooks/treasury/use-cash-payments";
import { useCashReceipt } from "../../../../hooks/treasury/use-cash-receipts";
import { useCategoryNameMap } from "../../../../hooks/treasury/use-cash-voucher-categories";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import type { VoucherDetailTarget } from "../../../../store/page-stores/report/report.interface";
import {
  cashPaymentToVoucherDetail,
  cashReceiptToVoucherDetail,
} from "../../../treasury/cash-vouchers.adapters";
import { CashVoucherCategoryDirection } from "../../../treasury/cash-vouchers.types";
import {
  DepositPaymentVoucherDialog,
  DepositReceiptVoucherDialog,
  PaymentVoucherDialog,
  ReceiptVoucherDialog,
  TreasuryVoucherDialogModeEnum,
} from "../../../treasury/documents";

interface Props {
  target: VoucherDetailTarget;
}

/**
 * Dialog xem phiếu thu/chi của báo cáo Quỹ tiền: dùng lại đúng dialog của Sổ
 * quỹ ở chế độ VIEW (ADR-01). Không truyền `onRequestEdit` / `onSave` nên chỉ
 * còn In / Xuất khẩu / Đóng.
 *
 * Phần tải dữ liệu chỉ mount khi có phiếu đang mở: `useCategoryNameMap` luôn
 * gọi API, không nên chạy trên mọi báo cáo và mọi tầng drill-down.
 */
export function ReportVoucherDetailDialog() {
  const target = useReportStore((s) => s.detailVoucher);
  return target ? <ReportVoucherDetail target={target} /> : null;
}

function ReportVoucherDetail({ target }: Props) {
  const setDetailVoucher = useReportStore((s) => s.actions.setDetailVoucher);
  const setDetailInvoice = useReportStore((s) => s.actions.setDetailInvoice);
  const { id, kind } = target;

  // Đúng một hook được bật theo loại phiếu; ba hook còn lại `enabled = false`.
  const cashReceipt = useCashReceipt(id, kind === "CASH_RECEIPT");
  const cashPayment = useCashPayment(id, kind === "CASH_PAYMENT");
  const bankReceipt = useBankReceipt(id, kind === "BANK_RECEIPT");
  const bankPayment = useBankPayment(id, kind === "BANK_PAYMENT");
  const categoryInMap = useCategoryNameMap(CashVoucherCategoryDirection.IN);
  const categoryOutMap = useCategoryNameMap(CashVoucherCategoryDirection.OUT);

  const query =
    kind === "CASH_RECEIPT"
      ? cashReceipt
      : kind === "CASH_PAYMENT"
        ? cashPayment
        : kind === "BANK_RECEIPT"
          ? bankReceipt
          : bankPayment;

  // Tiền mặt đi qua adapter như `LedgerCashPage`; tiền gửi truyền thẳng như `LedgerDepositPage`.
  const cashDetail = useMemo(() => {
    if (kind === "CASH_RECEIPT" && cashReceipt.data) {
      return cashReceiptToVoucherDetail(cashReceipt.data, categoryInMap);
    }
    if (kind === "CASH_PAYMENT" && cashPayment.data) {
      return cashPaymentToVoucherDetail(cashPayment.data, categoryOutMap);
    }
    return null;
  }, [kind, cashReceipt.data, cashPayment.data, categoryInMap, categoryOutMap]);

  const close = () => setDetailVoucher(null);
  const onOpenChange = (open: boolean) => {
    if (!open) close();
  };
  const failed = !query.data && query.isError;

  return (
    <>
      {query.isLoading
        ? // Portal ra body: nội dung `AppModal` có transform nên `fixed` bên
          // trong dialog drill-down chỉ phủ khung dialog; z-index vượt stack modal.
          createPortal(
            <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-foreground/20">
              <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 shadow-lg">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Đang tải dữ liệu...
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}

      <AppModal
        open={failed}
        onOpenChange={onOpenChange}
        title="Chi tiết phiếu"
        defaultWidth={420}
        defaultHeight={200}
        footer={
          <Button size="sm" onClick={close}>
            <X className="mr-1.5 h-4 w-4" />
            Đóng
          </Button>
        }
      >
        <p className="py-6 text-center text-sm text-destructive">
          Không tải được chi tiết phiếu.
        </p>
      </AppModal>

      {kind === "CASH_RECEIPT" ? (
        <ReceiptVoucherDialog
          open={!!cashDetail}
          onOpenChange={onOpenChange}
          mode={TreasuryVoucherDialogModeEnum.VIEW}
          initial={cashDetail}
          onOpenInvoice={(code) => setDetailInvoice({ code, id: null })}
        />
      ) : null}
      {kind === "CASH_PAYMENT" ? (
        <PaymentVoucherDialog
          open={!!cashDetail}
          onOpenChange={onOpenChange}
          mode={TreasuryVoucherDialogModeEnum.VIEW}
          initial={cashDetail}
        />
      ) : null}
      {kind === "BANK_RECEIPT" ? (
        <DepositReceiptVoucherDialog
          open={!!bankReceipt.data}
          onOpenChange={onOpenChange}
          mode={TreasuryVoucherDialogModeEnum.VIEW}
          initial={bankReceipt.data ?? null}
        />
      ) : null}
      {kind === "BANK_PAYMENT" ? (
        <DepositPaymentVoucherDialog
          open={!!bankPayment.data}
          onOpenChange={onOpenChange}
          mode={TreasuryVoucherDialogModeEnum.VIEW}
          initial={bankPayment.data ?? null}
        />
      ) : null}
    </>
  );
}
