import { useMemo, type MouseEvent } from "react";
import { cn, formatVnd } from "@erp/ui";

import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  DELIVERY_STATUS_BADGE,
  DELIVERY_STATUS_FILTER_OPTIONS,
  ORDER_CANCELLED_BADGE,
  ORDER_COLUMN_LABELS,
  ORDER_COLUMN_ORDER,
  ORDER_LABEL_OPTIONS,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_OPTIONS,
  OrderColumnKey,
  type DeliveryStatusFilterOption,
  type OrderLabelOption,
  type OrderTypeOption,
} from "@erp/pos/constants/order-list.constant";
import {
  useOpenDraftInvoice,
  type OrderFilterOperators,
  type OrderFilters,
  type OrderOperatorKey,
} from "@erp/pos/hooks/page-hooks/order-list/use-order-list";
import type { DeliveryOrderRow } from "@erp/pos/interfaces/sales-order.interface";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";

export interface OrderTableProps {
  rows: ReadonlyArray<DeliveryOrderRow>;
  filters: OrderFilters;
  filterOperators: OrderFilterOperators;
  onFilterChange: (key: keyof OrderFilters, value: string) => void;
  onFilterOperatorChange: (key: OrderOperatorKey, op: FilterOperatorEnum) => void;
  selectedIds: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}

const SELECT_COLUMN_KEY = "select";

const DRAFT_ROW_TITLE = "Mở hoá đơn nháp để thanh toán";

/**
 * Dòng dữ liệu dưới con trỏ — `PosDataTable` không có sự kiện theo dòng nên
 * bắt ở khung bọc: `<tr>` trong `<tbody>` khớp 1-1 với `rows` theo thứ tự.
 */
function rowAtEvent(
  event: MouseEvent<HTMLElement>,
  rows: ReadonlyArray<DeliveryOrderRow>,
): DeliveryOrderRow | null {
  const tr = (event.target as HTMLElement).closest("tr");
  if (!tr || tr.parentElement?.tagName !== "TBODY") return null;
  return rows[tr.sectionRowIndex] ?? null;
}

const dateText = (iso: string | null): string =>
  iso ? formatViDateTime(iso) : "";

/** "Tên · SĐT" — bỏ phần trống. */
const recipientText = (row: DeliveryOrderRow): string =>
  [row.recipientName, row.recipientPhone].filter(Boolean).join(" · ");

function StatusBadge({ row }: { row: DeliveryOrderRow }) {
  // Chuyển hoàn cũng huỷ đơn (ADR-04) nhưng giữ nhãn "Đã chuyển hoàn".
  const badge =
    row.status === "CANCELLED" && row.deliveryStatus !== "RETURNED"
      ? ORDER_CANCELLED_BADGE
      : DELIVERY_STATUS_BADGE[row.deliveryStatus];
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium",
        badge.className,
      )}
    >
      {badge.label}
    </span>
  );
}

/**
 * Lưới "Đơn hàng" — ô tick + 24 cột (A-11/A-12), cuộn ngang. Hàng lọc cùng
 * kiểu toán tử với DS hoá đơn: `*` cho chữ, `≤` cho số và ngày; Loại đơn hàng,
 * Nhãn, Trạng thái lọc bằng select. Thu ngân, Khách nợ, Thu hộ không có ô lọc
 * (server không lọc Thu ngân; Khách nợ trùng nguồn Còn phải thu; Thu hộ = 0).
 */
export function OrderTable({
  rows,
  filters,
  filterOperators,
  onFilterChange,
  onFilterOperatorChange,
  selectedIds,
  onToggleRow,
  onToggleAll,
}: OrderTableProps) {
  const columns = useMemo<PosDataTableColumn<DeliveryOrderRow>[]>(() => {
    const textFilter = (key: OrderOperatorKey) => (
      <PosDataTableFilterCell
        value={filters[key]}
        onChange={(next) => onFilterChange(key, next)}
        operatorType={FilterOperatorTypeEnum.TEXT}
        leadingOperator={FilterOperatorEnum.CONTAINS}
        operator={filterOperators[key]}
        onOperatorChange={(op) => onFilterOperatorChange(key, op)}
      />
    );
    const compareFilter = (key: OrderOperatorKey, placeholder?: string) => (
      <PosDataTableFilterCell
        value={filters[key]}
        onChange={(next) => onFilterChange(key, next)}
        operatorType={FilterOperatorTypeEnum.NUMBER}
        leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
        operator={filterOperators[key]}
        onOperatorChange={(op) => onFilterOperatorChange(key, op)}
        placeholder={placeholder}
        align={placeholder ? "left" : "right"}
      />
    );
    const dateFilter = (key: OrderOperatorKey) =>
      compareFilter(key, "dd/mm/yyyy");

    const dateCol = (
      pick: (row: DeliveryOrderRow) => string | null,
      filterKey: OrderOperatorKey,
    ) => ({
      headerClassName: "min-w-[170px] whitespace-nowrap",
      cellClassName: "whitespace-nowrap",
      render: (row: DeliveryOrderRow) => dateText(pick(row)),
      filterRender: dateFilter(filterKey),
    });
    const textCol = (
      pick: (row: DeliveryOrderRow) => string | null,
      filterKey?: OrderOperatorKey,
      width = "min-w-[140px]",
    ) => ({
      headerClassName: `${width} whitespace-nowrap`,
      render: (row: DeliveryOrderRow) => pick(row) ?? "",
      filterRender: filterKey ? textFilter(filterKey) : undefined,
    });
    const moneyCol = (
      pick: (row: DeliveryOrderRow) => number | null,
      filterKey?: OrderOperatorKey,
    ) => ({
      align: "right" as const,
      headerClassName: "min-w-[130px] whitespace-nowrap",
      cellClassName: "tabular-nums whitespace-nowrap",
      render: (row: DeliveryOrderRow) => {
        const value = pick(row);
        // NULL = chưa biết (vd Phí GH trả ĐT chưa nhập) — để trống, không phải 0.
        return value === null ? "" : formatVnd(value);
      },
      filterRender: filterKey ? compareFilter(filterKey) : undefined,
    });

    const byKey: Record<
      OrderColumnKey,
      Omit<PosDataTableColumn<DeliveryOrderRow>, "key" | "title">
    > = {
      [OrderColumnKey.CreatedAt]: dateCol((r) => r.createdAt, "orderDate"),
      [OrderColumnKey.DeliveredAt]: dateCol((r) => r.deliveredAt, "deliveredAt"),
      [OrderColumnKey.InvoiceDate]: dateCol((r) => r.invoiceDate, "invoiceDate"),
      [OrderColumnKey.InvoiceCode]: textCol((r) => r.invoiceCode, "invoiceCode"),
      [OrderColumnKey.CashierName]: textCol((r) => r.cashierName),
      [OrderColumnKey.SalespersonName]: textCol(
        (r) => r.salespersonName,
        "salespersonName",
      ),
      [OrderColumnKey.CustomerName]: textCol(
        (r) => r.customerName,
        "customerName",
        "min-w-[160px]",
      ),
      [OrderColumnKey.Recipient]: textCol(
        recipientText,
        "deliveryInfo",
        "min-w-[200px]",
      ),
      [OrderColumnKey.ShippingFeeCustomer]: moneyCol(
        (r) => r.shippingFeeCustomer,
        "shippingFeeCustomer",
      ),
      [OrderColumnKey.DeliveryPartnerName]: textCol(
        (r) => r.deliveryPartnerName,
        "deliveryPartnerName",
      ),
      [OrderColumnKey.TrackingCode]: textCol(
        (r) => r.trackingCode,
        "trackingCode",
      ),
      [OrderColumnKey.ExternalOrderId]: textCol(
        (r) => r.externalOrderId,
        "externalOrderId",
        "min-w-[160px]",
      ),
      [OrderColumnKey.AmountDue]: moneyCol((r) => r.amountDue, "amountDue"),
      [OrderColumnKey.Deposit]: moneyCol((r) => r.deposit, "deposit"),
      [OrderColumnKey.CustomerDebt]: moneyCol((r) => r.customerDebt),
      [OrderColumnKey.RemainingReceivable]: moneyCol(
        (r) => r.remainingReceivable,
        "remainingReceivable",
      ),
      [OrderColumnKey.Cod]: moneyCol((r) => r.cod),
      [OrderColumnKey.PackageInfo]: textCol(
        (r) => r.packageInfo,
        "packageInfo",
        "min-w-[180px]",
      ),
      [OrderColumnKey.PartnerShippingFee]: moneyCol(
        (r) => r.partnerShippingFee,
        "partnerShippingFee",
      ),
      [OrderColumnKey.SalesChannel]: textCol(
        (r) => r.salesChannel,
        "salesChannel",
      ),
      [OrderColumnKey.OrderType]: {
        headerClassName: "min-w-[130px] whitespace-nowrap",
        cellClassName: "whitespace-nowrap",
        render: (row) => ORDER_TYPE_LABEL[row.orderType],
        // Mọi đơn đều là "Đặt hàng" — chọn gì cũng không đổi kết quả.
        filterRender: (
          <PosSelect<OrderTypeOption>
            value={
              ORDER_TYPE_OPTIONS.find((o) => o.value === filters.orderType) ??
              null
            }
            onChange={(item) => onFilterChange("orderType", item.value)}
            items={ORDER_TYPE_OPTIONS}
            itemKey={(o) => o.value || "all"}
            renderItem={(o) => o.label}
            ariaLabel="Lọc theo loại đơn hàng"
            variant="underline"
          />
        ),
      },
      [OrderColumnKey.Label]: {
        headerClassName: "min-w-[120px] whitespace-nowrap",
        cellClassName: "whitespace-nowrap",
        render: (row) =>
          row.stockShort ? (
            <span className="inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-[12px] font-medium text-orange-700">
              Thiếu hàng
            </span>
          ) : null,
        filterRender: (
          <PosSelect<OrderLabelOption>
            value={
              ORDER_LABEL_OPTIONS.find((o) => o.value === filters.label) ?? null
            }
            onChange={(item) => onFilterChange("label", item.value)}
            items={ORDER_LABEL_OPTIONS}
            itemKey={(o) => o.value || "all"}
            renderItem={(o) => o.label}
            ariaLabel="Lọc theo nhãn"
            variant="underline"
          />
        ),
      },
      [OrderColumnKey.Note]: textCol((r) => r.note, "note", "min-w-[160px]"),
      [OrderColumnKey.Status]: {
        headerClassName: "min-w-[170px] whitespace-nowrap",
        cellClassName: "whitespace-nowrap",
        render: (row) => <StatusBadge row={row} />,
        filterRender: (
          <PosSelect<DeliveryStatusFilterOption>
            value={
              DELIVERY_STATUS_FILTER_OPTIONS.find(
                (o) => o.value === filters.deliveryStatus,
              ) ?? null
            }
            onChange={(item) => onFilterChange("deliveryStatus", item.value)}
            items={DELIVERY_STATUS_FILTER_OPTIONS}
            itemKey={(o) => o.value || "all"}
            renderItem={(o) => o.label}
            ariaLabel="Lọc theo trạng thái giao"
            variant="underline"
            menuMinWidth={180}
          />
        ),
      },
    };

    const allChecked =
      rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

    return [
      {
        key: SELECT_COLUMN_KEY,
        title: (
          <PosCheckbox
            checked={allChecked}
            onChange={onToggleAll}
            ariaLabel="Chọn tất cả đơn"
          />
        ),
        headerClassName: "w-10",
        cellClassName: "w-10",
        render: (row) => (
          <PosCheckbox
            checked={selectedIds.has(row.id)}
            onChange={() => onToggleRow(row.id)}
            ariaLabel="Chọn đơn"
          />
        ),
      },
      ...ORDER_COLUMN_ORDER.map((key) => ({
        key,
        title: ORDER_COLUMN_LABELS[key],
        ...byKey[key],
      })),
    ];
  }, [
    rows,
    filters,
    filterOperators,
    onFilterChange,
    onFilterOperatorChange,
    selectedIds,
    onToggleRow,
    onToggleAll,
  ]);

  const openDraftInvoice = useOpenDraftInvoice();

  // Bấm dòng hoá đơn nháp → mở vào tab checkout. Bấm ô tick không mở, và bấm
  // dòng không đổi ô tick.
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("td")?.cellIndex === 0) return;
    if (target.closest("button, input, label, a")) return;
    const row = rowAtEvent(event, rows);
    if (row) openDraftInvoice(row);
  };

  const handleMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    event.currentTarget.title = rowAtEvent(event, rows)?.invoiceIsDraft
      ? DRAFT_ROW_TITLE
      : "";
  };

  return (
    <div
      className="h-full min-h-0 overflow-auto"
      onClick={handleClick}
      onMouseOver={handleMouseOver}
    >
      <PosDataTable<DeliveryOrderRow>
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.id}
        emptyText="Không có đơn hàng nào!"
        hasBorder={false}
        rowClassName={(row) =>
          row.invoiceIsDraft ? "cursor-pointer" : undefined
        }
      />
    </div>
  );
}
