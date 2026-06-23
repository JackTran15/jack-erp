import { Badge } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { VoucherLink } from "../../documents";
import {
  CASH_COUNT_STATUS_FILTER_OPTIONS,
  CASH_COUNT_STATUS_LABEL,
} from "./cash-count.constants";
import {
  LEDGER_CASH_VI_DATE,
} from "../../ledger-cash/ledger-cash.constants";
import {
  CashCountStatusEnum,
  type CashCountRecord,
} from "./cash-count.types";

export function useCashCountTableColumns(
  onOpenRecord: (record: CashCountRecord) => void,
) {
  return useMemo(
    (): TableColumn<CashCountRecord>[] => [
      {
        key: "countDate",
        label: "Ngày",
        width: 110,
        filterKind: "date-range",
        render: (r) =>
          new Date(`${r.countDate}T12:00:00`).toLocaleDateString(
            "vi-VN",
            LEDGER_CASH_VI_DATE,
          ),
      },
      {
        key: "documentNumber",
        label: "Số phiếu KK",
        width: 130,
        render: (r) => (
          <VoucherLink
            code={r.documentNumber}
            clickable
            onClick={() => onOpenRecord(r)}
          />
        ),
      },
      {
        key: "inventoryUntilDate",
        label: "Kiểm kê đến ngày",
        width: 130,
        filterKind: "date-range",
        render: (r) =>
          new Date(`${r.inventoryUntilDate}T12:00:00`).toLocaleDateString(
            "vi-VN",
            LEDGER_CASH_VI_DATE,
          ),
      },
      {
        key: "purpose",
        label: "Mục đích",
        width: 220,
        render: (r) => r.purpose,
      },
      {
        key: "statusLabel",
        label: "Trạng thái",
        width: 120,
        filterKind: "select",
        filterOptions: CASH_COUNT_STATUS_FILTER_OPTIONS,
        render: (r) => {
          const label = CASH_COUNT_STATUS_LABEL[r.status];
          const variant =
            r.status === CashCountStatusEnum.PROCESSED
              ? "default"
              : "secondary";
          return <Badge variant={variant}>{label}</Badge>;
        },
      },
    ],
    [onOpenRecord],
  );
}
