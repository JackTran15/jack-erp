import { PosDataTable, type PosDataTableColumn } from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import { formatVnd } from "@erp/ui";
import { useMemo, useState } from "react";
import { DebtTypeFilterEnum } from "@erp/pos/constants/checkout.constant";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import type { DebtEntry } from "@erp/pos/lib/page-libs/checkout/customerDetail.types";

export interface DebtTabProps {
  rows: DebtEntry[];
}

/**
 * "Công nợ" tab — same shell as `PurchaseHistoryTab` but with debt-document
 * columns. Filters are inert visual placeholders (mirrors purchase history).
 */
export function DebtTab({ rows }: DebtTabProps) {
  const [typeFilter, setTypeFilter] = useState<DebtTypeFilterEnum>(
    DebtTypeFilterEnum.ALL,
  );

  const typeOptions = useMemo(
    () => [
      { value: DebtTypeFilterEnum.ALL, label: "Tất cả" },
      {
        value: DebtTypeFilterEnum.REDUCE_DEBT_RETURN_INVOICE,
        label: DebtTypeFilterEnum.REDUCE_DEBT_RETURN_INVOICE,
      },
      {
        value: DebtTypeFilterEnum.SALES_INVOICE_WITH_DEBT,
        label: DebtTypeFilterEnum.SALES_INVOICE_WITH_DEBT,
      },
      {
        value: DebtTypeFilterEnum.CASH_RECEIPT,
        label: DebtTypeFilterEnum.CASH_RECEIPT,
      },
      {
        value: DebtTypeFilterEnum.COLLECT_DEBT_CASH,
        label: DebtTypeFilterEnum.COLLECT_DEBT_CASH,
      },
      {
        value: DebtTypeFilterEnum.STORE_SALES_INVOICE,
        label: DebtTypeFilterEnum.STORE_SALES_INVOICE,
      },
      {
        value: DebtTypeFilterEnum.DEPOSIT_RECEIPT,
        label: DebtTypeFilterEnum.DEPOSIT_RECEIPT,
      },
      {
        value: DebtTypeFilterEnum.COLLECT_DEBT_CARD,
        label: DebtTypeFilterEnum.COLLECT_DEBT_CARD,
      },
    ],
    [],
  );
  const filtered =
    typeFilter === DebtTypeFilterEnum.ALL
      ? rows
      : rows.filter((r) => r.documentType === String(typeFilter));

  const total = filtered.reduce((s, r) => s + r.amount, 0);
  const columns = useMemo<ReadonlyArray<PosDataTableColumn<DebtEntry>>>(
    () => [
      {
        key: "date",
        title: "Ngày hóa đơn",
        render: (row) => formatViDateTime(row.date),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.EQUALS}
          />
        ),
      },
      {
        key: "documentNumber",
        title: "Số chứng từ",
        render: (row) => (
          <span className="font-medium text-[#5C6BC0]">
            {row.documentNumber}
          </span>
        ),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "documentType",
        title: "Loại chứng từ",
        render: (row) => row.documentType,
        filterRender: (
          <PosSelect
            value={typeOptions.find((o) => o.value === typeFilter) ?? null}
            onChange={(item) => setTypeFilter(item.value)}
            items={typeOptions}
            itemKey={(o) => o.value}
            renderItem={(o) => o.label}
            variant="underline"
            className="min-w-[160px]"
          />
        ),
      },
      {
        key: "amount",
        title: "Giá trị",
        align: "right",
        render: (row) => formatVnd(row.amount),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            align="right"
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
          />
        ),
      },
      {
        key: "remainingDebt",
        title: "Dư nợ cuối",
        align: "right",
        render: (row) => formatVnd(row.remainingDebt),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            align="right"
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.EQUALS}
          />
        ),
      },
      {
        key: "branch",
        title: "Chi nhánh",
        render: (row) => row.branch,
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
    ],
    [typeFilter, typeOptions],
  );

  return (
    <div className="flex flex-col">
      <div className="max-h-[360px] overflow-auto border border-gray-200">
        <PosDataTable
          columns={columns}
          dataSource={filtered}
          rowKey={(row) => row.id}
          emptyText="Chưa có chứng từ công nợ."
          summaryRow={
            filtered.length > 0 ? (
              <tr className="h-10 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
                <td colSpan={3} className="px-3">
                  Tổng chứng từ: {filtered.length}
                </td>
                <td className="px-3 text-right">{formatVnd(total)}</td>
                <td colSpan={2} />
              </tr>
            ) : null
          }
        />
      </div>
      <PosPaginationBar
        page={1}
        totalPages={1}
        pageSize={100}
        total={filtered.length}
      />
    </div>
  );
}
