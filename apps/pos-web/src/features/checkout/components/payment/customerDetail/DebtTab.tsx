import { formatVnd } from "@erp/ui";
import { useMemo, useState } from "react";
import { formatViDateTime } from "../../../../../lib/dateTime";
import { DebtTypeFilterEnum } from "../../../constants/customer";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "../../../constants/filterOperator";
import { PosSelect } from "../../common/forms/PosSelect";
import {
  CustomerDetailDataTable,
  type CustomerDetailTableColumn,
} from "./CustomerDetailDataTable";
import { CustomerDetailFilterInput } from "./CustomerDetailFilterInput";
import { PaginationBar } from "./PaginationBar";
import type { DebtEntry } from "./types";

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
  const columns = useMemo<ReadonlyArray<CustomerDetailTableColumn<DebtEntry>>>(
    () => [
      {
        key: "date",
        title: "Ngày hóa đơn",
        render: (row) => formatViDateTime(row.date),
        filterRender: (
          <CustomerDetailFilterInput
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
          <CustomerDetailFilterInput
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
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
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
          <CustomerDetailFilterInput
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
          <CustomerDetailFilterInput
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
          <CustomerDetailFilterInput
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
        <CustomerDetailDataTable
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
      <PaginationBar
        page={1}
        totalPages={1}
        pageSize={100}
        total={filtered.length}
      />
    </div>
  );
}
