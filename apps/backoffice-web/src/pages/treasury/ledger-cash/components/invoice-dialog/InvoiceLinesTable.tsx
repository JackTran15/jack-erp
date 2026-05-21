import { BaseDataTable } from "../../../../../components/table/BaseDataTable";
import type { LedgerCashInvoiceDetail } from "../../ledger-cash.types";
import { useInvoiceDetailColumns } from "./useInvoiceDetailColumns";

interface Props {
  detail: LedgerCashInvoiceDetail;
}

export function InvoiceLinesTable({ detail }: Props) {
  const { columnsWithFooter, lineRows } = useInvoiceDetailColumns(detail);

  return (
    <BaseDataTable
      className="min-h-0 flex-1"
      scrollContainerClassName="min-h-0"
      columns={columnsWithFooter}
      rows={lineRows}
      loading={false}
      emptyLabel="Không có dòng hàng."
      getRowKey={(r) => `${r.sku}-${r.index}`}
    />
  );
}
