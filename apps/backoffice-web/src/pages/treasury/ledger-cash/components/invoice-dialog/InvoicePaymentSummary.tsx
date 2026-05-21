import { formatMoneyInteger } from "@erp/ui";
import { LedgerCashInvoiceKindEnum } from "../../ledger-cash.types";
import type { LedgerCashInvoiceDetail } from "../../ledger-cash.types";
import { InvoiceDetailSummaryRow } from "./InvoiceDetailSummaryRow";

interface Props {
  detail: LedgerCashInvoiceDetail;
}

export function InvoicePaymentSummary({ detail }: Props) {
  const isReturn = detail.kind === LedgerCashInvoiceKindEnum.RETURN;

  return (
    <div className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
      <div className="space-y-2">
        <InvoiceDetailSummaryRow
          label="Tổng thanh toán"
          value={formatMoneyInteger(detail.totalPayment)}
        />
        <InvoiceDetailSummaryRow
          label="Tiền hàng"
          value={formatMoneyInteger(detail.goodsAmount)}
        />
        {isReturn && detail.returnValue != null ? (
          <InvoiceDetailSummaryRow
            label="Giá trị trả lại"
            value={formatMoneyInteger(detail.returnValue)}
          />
        ) : null}
      </div>
      <div className="space-y-2">
        {isReturn ? (
          <InvoiceDetailSummaryRow
            label="Trả lại khách"
            value={formatMoneyInteger(detail.refundToCustomer ?? 0)}
          />
        ) : (
          <InvoiceDetailSummaryRow
            label="Khách trả"
            value={formatMoneyInteger(
              detail.customerPaid ?? detail.totalPayment,
            )}
          />
        )}
        <InvoiceDetailSummaryRow
          label="Tiền mặt"
          value={formatMoneyInteger(detail.cashAmount)}
        />
        {!isReturn &&
        detail.changeAmount != null &&
        detail.changeAmount > 0 ? (
          <InvoiceDetailSummaryRow
            label="Trả lại khách"
            value={formatMoneyInteger(detail.changeAmount)}
          />
        ) : null}
      </div>
    </div>
  );
}
