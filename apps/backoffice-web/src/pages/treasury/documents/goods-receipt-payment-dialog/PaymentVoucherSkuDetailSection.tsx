import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import type {
  LedgerCashVoucherDetail,
  LedgerCashVoucherSkuLine,
} from "../../ledger-cash/ledger-cash.types";

interface Props {
  detail: LedgerCashVoucherDetail;
  skuColumns: TableColumn<LedgerCashVoucherSkuLine>[];
}

export function PaymentVoucherSkuDetailSection({ detail, skuColumns }: Props) {
  const rows = detail.skuLines ?? [];

  return (
    <div className="min-h-0 flex-1 flex overflow-auto mt-1">
      <BaseDataTable
        className="min-h-0 flex-1"
        columns={skuColumns}
        rows={rows}
        loading={false}
        emptyLabel="Không có hàng hóa."
        getRowKey={(r) => r.sku}
      />
    </div>
  );
}
