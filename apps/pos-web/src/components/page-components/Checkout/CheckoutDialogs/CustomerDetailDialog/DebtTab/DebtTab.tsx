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
import { useCustomerDebts } from "@erp/pos/hooks/react-query/use-query-customer";
import { mapCustomerDebts } from "@erp/pos/lib/page-libs/checkout/mapCustomerDebts";
import { InvoiceReceiptDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/InvoiceReceiptDialog/InvoiceReceiptDialog";
import type { DebtEntry } from "@erp/pos/interfaces/customer-detail.interface";

export interface DebtTabProps {
  /** Khách cần lấy công nợ (`GET /invoices/customers/:id/debts`). */
  customerId: string;
  /** Chỉ fetch khi dialog mở và đang ở tab này. */
  enabled?: boolean;
  /** Tên + SĐT khách (hiển thị trong biên lai chi tiết). */
  customerName?: string;
  customerPhone?: string | null;
}

/**
 * "Công nợ" tab — fetch lười `GET /invoices/customers/:id/debts` (mirror
 * `PurchaseHistoryTab`). Cột lọc text/number là placeholder; chỉ dropdown "Loại
 * chứng từ" lọc client-side. Endpoint không trả tên chi nhánh → cột hiển thị "—".
 */
export function DebtTab({
  customerId,
  enabled = true,
  customerName,
  customerPhone,
}: DebtTabProps) {
  const [typeFilter, setTypeFilter] = useState<DebtTypeFilterEnum>(
    DebtTypeFilterEnum.ALL,
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );

  const { data, isLoading } = useCustomerDebts(customerId, enabled);
  const rows = useMemo(() => mapCustomerDebts(data ?? []), [data]);

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
          <button
            type="button"
            onClick={() => setSelectedInvoiceId(row.invoiceId)}
            className="font-medium text-[#5C6BC0] hover:underline focus:outline-none focus-visible:underline"
          >
            {row.documentNumber}
          </button>
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
        render: (row) => row.branch || "—",
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
    <>
      <div className="flex flex-col">
        <div className="max-h-[360px] overflow-auto border border-gray-200">
          <PosDataTable
            columns={columns}
            dataSource={filtered}
            rowKey={(row) => row.id}
            emptyText={isLoading ? "Đang tải…" : "Chưa có chứng từ công nợ."}
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

      <InvoiceReceiptDialog
        open={selectedInvoiceId !== null}
        invoiceId={selectedInvoiceId}
        onClose={() => setSelectedInvoiceId(null)}
        customerName={customerName}
        customerPhone={customerPhone}
      />
    </>
  );
}
