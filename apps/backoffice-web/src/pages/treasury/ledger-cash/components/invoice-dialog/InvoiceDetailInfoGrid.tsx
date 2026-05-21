import { LEDGER_CASH_VI_DATE_TIME } from "../../ledger-cash.constants";
import type { LedgerCashInvoiceDetail } from "../../ledger-cash.types";
import { InvoiceDetailInfoField } from "./InvoiceDetailInfoField";

interface Props {
  detail: LedgerCashInvoiceDetail;
}

export function InvoiceDetailInfoGrid({ detail }: Props) {
  return (
    <>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <InvoiceDetailInfoField label="Số" value={detail.code} />
        <InvoiceDetailInfoField label="Thu ngân" value={detail.cashier} />
        <InvoiceDetailInfoField label="Khách hàng" value={detail.customer} />
        <InvoiceDetailInfoField
          label="Ngày"
          value={detail.issuedAt.toLocaleString("vi-VN", LEDGER_CASH_VI_DATE_TIME)}
        />
        {detail.phone ? (
          <InvoiceDetailInfoField label="Điện thoại" value={detail.phone} />
        ) : null}
        <InvoiceDetailInfoField
          label="Kênh bán hàng"
          value={detail.salesChannel}
        />
      </div>

      {detail.originalInvoiceCode ? (
        <p className="text-sm text-muted-foreground">
          Trả hàng cho hóa đơn:{" "}
          <span className="font-medium text-foreground">
            {detail.originalInvoiceCode}
          </span>
        </p>
      ) : null}
    </>
  );
}
