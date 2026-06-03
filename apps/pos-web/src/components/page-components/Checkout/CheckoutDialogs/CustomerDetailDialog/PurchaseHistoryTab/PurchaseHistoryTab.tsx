import { useCallback, useMemo, useState } from "react";
import { formatVnd } from "@erp/ui";
import { PosDataTable, type PosDataTableColumn } from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
  PurchaseHistoryStatusEnum,
  PurchaseHistoryStatusFilterEnum,
} from "@erp/pos/constants/checkout.constant";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { StatusBadge } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/StatusBadge/StatusBadge";
import { InvoiceReceiptDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/InvoiceReceiptDialog/InvoiceReceiptDialog";
import { formatViDateTime, parseViDate } from "@erp/pos/lib/common/dateTime";
import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import { useCustomerPurchaseHistory } from "@erp/pos/hooks/react-query/use-query-customer";
import { mapInvoicesToPurchaseHistory } from "@erp/pos/lib/page-libs/checkout/mapPurchaseHistory";
import {
  columnToCompareFilter,
  columnToStringFilter,
} from "@erp/pos/lib/common/invoiceFilterToBody";
import type { ColumnFilterState } from "@erp/pos/interfaces/column-filter.interface";
import type {
  DateRangeFilter,
  SearchPurchaseHistoryBody,
} from "@erp/pos/dtos/invoice.dto";
import type { PurchaseHistoryEntry } from "@erp/pos/interfaces/customer-detail.interface";

export interface PurchaseHistoryTabProps {
  /** Customer whose history to fetch (`POST /v2/invoices/purchase-history/search`). */
  customerId: string;
  /** Fetch only when the dialog is open and this tab is active. */
  enabled?: boolean;
  /** Fallback store name when a row's branch is missing. */
  branchName?: string | null;
  /** Tên + SĐT khách (hiển thị trong biên lai chi tiết). */
  customerName?: string;
  customerPhone?: string | null;
}

const PURCHASE_HISTORY_PAGE_SIZE = 100;

const STATUS_FILTER_TO_STATUS: Record<
  PurchaseHistoryStatusFilterEnum,
  PurchaseHistoryStatusEnum | null
> = {
  [PurchaseHistoryStatusFilterEnum.ALL]: null,
  [PurchaseHistoryStatusFilterEnum.PAID]: PurchaseHistoryStatusEnum.PAID,
  [PurchaseHistoryStatusFilterEnum.DEBT]: PurchaseHistoryStatusEnum.DEBT,
};

/** UI status enum → backend `InvoiceStatus` value sent to the search endpoint. */
const STATUS_TO_API: Record<PurchaseHistoryStatusEnum, string> = {
  [PurchaseHistoryStatusEnum.PAID]: "paid",
  [PurchaseHistoryStatusEnum.DEBT]: "debt",
};

/** Per-column filter state for the text/number/date columns (status uses its own select). */
interface PurchaseHistoryColumnFilters {
  invoiceDate: ColumnFilterState;
  invoiceNumber: ColumnFilterState;
  storeName: ColumnFilterState;
  totalAmount: ColumnFilterState;
  note: ColumnFilterState;
}

/** Default operators mirror each cell's `leadingOperator`; values start empty. */
const DEFAULT_COLUMN_FILTERS: PurchaseHistoryColumnFilters = {
  invoiceDate: { operator: FilterOperatorEnum.LESS_THAN_OR_EQUAL, value: "" },
  invoiceNumber: { operator: FilterOperatorEnum.CONTAINS, value: "" },
  storeName: { operator: FilterOperatorEnum.EQUALS, value: "" },
  totalAmount: { operator: FilterOperatorEnum.LESS_THAN_OR_EQUAL, value: "" },
  note: { operator: FilterOperatorEnum.CONTAINS, value: "" },
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A `dd/MM/yyyy` date cell + operator → `issuedAt` range filter. */
function dateColumnToRange(state: ColumnFilterState): DateRangeFilter | undefined {
  const parsed = parseViDate(state.value);
  if (!parsed) return undefined;
  const iso = toIsoDate(parsed);
  switch (state.operator) {
    case FilterOperatorEnum.LESS_THAN:
    case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
      return { to: iso };
    case FilterOperatorEnum.GREATER_THAN:
    case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
      return { from: iso };
    case FilterOperatorEnum.EQUALS:
      return { from: iso, to: iso };
    default:
      return undefined;
  }
}

/**
 * "Lịch sử mua hàng" tab — server-side filtered via
 * `POST /v2/invoices/purchase-history/search`. The header filter row maps to v2
 * filter shapes (debounced); the status select maps "Tất cả/Đã thanh toán/Ghi
 * nợ" to the backend `status` enum. "Tên cửa hàng" comes from the joined branch.
 */
export function PurchaseHistoryTab({
  customerId,
  enabled = true,
  branchName,
  customerName,
  customerPhone,
}: PurchaseHistoryTabProps) {
  const [statusFilter, setStatusFilter] =
    useState<PurchaseHistoryStatusFilterEnum>(
      PurchaseHistoryStatusFilterEnum.ALL,
    );
  const [columnFilters, setColumnFilters] =
    useState<PurchaseHistoryColumnFilters>(DEFAULT_COLUMN_FILTERS);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const selectedStatus = STATUS_FILTER_TO_STATUS[statusFilter];

  const updateFilter = useCallback(
    (key: keyof PurchaseHistoryColumnFilters, patch: Partial<ColumnFilterState>) =>
      setColumnFilters((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } })),
    [],
  );

  // Debounce the typed values so each keystroke doesn't fire a request.
  const debouncedFilters = useDebounce(columnFilters);

  const searchBody = useMemo<Omit<SearchPurchaseHistoryBody, "customerId">>(
    () => ({
      page: 1,
      limit: PURCHASE_HISTORY_PAGE_SIZE,
      code: columnToStringFilter(debouncedFilters.invoiceNumber),
      issuedAt: dateColumnToRange(debouncedFilters.invoiceDate),
      storeName: columnToStringFilter(debouncedFilters.storeName),
      status: selectedStatus
        ? { value: STATUS_TO_API[selectedStatus] }
        : undefined,
      totalPaid: columnToCompareFilter(debouncedFilters.totalAmount),
      note: columnToStringFilter(debouncedFilters.note),
    }),
    [debouncedFilters, selectedStatus],
  );

  const { data, isLoading } = useCustomerPurchaseHistory(
    customerId,
    searchBody,
    enabled,
  );

  const rows = useMemo(
    () => mapInvoicesToPurchaseHistory(data?.data ?? [], branchName ?? null),
    [data, branchName],
  );
  const total = data?.total ?? 0;

  const statusOptions = useMemo(
    () => [
      { value: PurchaseHistoryStatusFilterEnum.ALL, label: "Tất cả" },
      {
        value: PurchaseHistoryStatusFilterEnum.PAID,
        label: "Đã thanh toán",
      },
      { value: PurchaseHistoryStatusFilterEnum.DEBT, label: "Ghi nợ" },
    ],
    [],
  );

  const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
  const columns = useMemo<
    ReadonlyArray<PosDataTableColumn<PurchaseHistoryEntry>>
  >(
    () => [
      {
        key: "invoiceDate",
        title: "Ngày hóa đơn",
        render: (row) => formatViDateTime(row.invoiceDate),
        filterRender: (
          <PosDataTableFilterCell
            placeholder="dd/MM/yyyy"
            value={columnFilters.invoiceDate.value}
            onChange={(next) => updateFilter("invoiceDate", { value: next })}
            operator={columnFilters.invoiceDate.operator}
            onOperatorChange={(op) => updateFilter("invoiceDate", { operator: op })}
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
          />
        ),
      },
      {
        key: "invoiceNumber",
        title: "Số hóa đơn",
        render: (row) => (
          <button
            type="button"
            onClick={() => setSelectedInvoiceId(row.id)}
            className="font-medium text-[#5C6BC0] hover:underline focus:outline-none focus-visible:underline"
          >
            {row.invoiceNumber}
          </button>
        ),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            value={columnFilters.invoiceNumber.value}
            onChange={(next) => updateFilter("invoiceNumber", { value: next })}
            operator={columnFilters.invoiceNumber.operator}
            onOperatorChange={(op) =>
              updateFilter("invoiceNumber", { operator: op })
            }
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "storeName",
        title: "Tên cửa hàng",
        render: (row) => row.storeName || "—",
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            value={columnFilters.storeName.value}
            onChange={(next) => updateFilter("storeName", { value: next })}
            operator={columnFilters.storeName.operator}
            onOperatorChange={(op) => updateFilter("storeName", { operator: op })}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.EQUALS}
          />
        ),
      },
      {
        key: "status",
        title: "Trạng thái",
        render: (row) => <StatusBadge status={row.status} />,
        filterRender: (
          <PosSelect
            value={
              statusOptions.find((o) => o.value === statusFilter) ?? null
            }
            onChange={(item) => setStatusFilter(item.value)}
            items={statusOptions}
            itemKey={(o) => o.value}
            renderItem={(o) => o.label}
            variant="underline"
            className="min-w-[130px]"
          />
        ),
      },
      {
        key: "totalAmount",
        title: "Tổng thanh toán",
        align: "right",
        render: (row) => formatVnd(row.totalAmount),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            align="right"
            value={columnFilters.totalAmount.value}
            onChange={(next) => updateFilter("totalAmount", { value: next })}
            operator={columnFilters.totalAmount.operator}
            onOperatorChange={(op) =>
              updateFilter("totalAmount", { operator: op })
            }
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
          />
        ),
      },
      {
        key: "note",
        title: "Ghi chú",
        render: (row) => row.note ?? "",
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            value={columnFilters.note.value}
            onChange={(next) => updateFilter("note", { value: next })}
            operator={columnFilters.note.operator}
            onOperatorChange={(op) => updateFilter("note", { operator: op })}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
    ],
    [statusFilter, statusOptions, columnFilters, updateFilter],
  );

  return (
    <>
      <div className="flex flex-col">
        <div className="max-h-[360px] overflow-auto border border-gray-200">
          <PosDataTable
            columns={columns}
            dataSource={rows}
            rowKey={(row) => row.id}
            emptyText={isLoading ? "Đang tải…" : "Chưa có hóa đơn nào."}
            summaryRow={
              rows.length > 0 ? (
                <tr className="h-10 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
                  <td colSpan={4} className="px-3">
                    Tổng hóa đơn: {total}
                  </td>
                  <td className="px-3 text-right">{formatVnd(grandTotal)}</td>
                  <td />
                </tr>
              ) : null
            }
          />
        </div>
        <PosPaginationBar
          page={1}
          totalPages={1}
          pageSize={PURCHASE_HISTORY_PAGE_SIZE}
          total={total}
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
