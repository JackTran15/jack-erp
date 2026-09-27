import { useMemo } from "react";
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
  ONLINE_ORDER_COLUMN_LABELS,
  ONLINE_ORDER_COLUMN_ORDER,
  ONLINE_ORDER_LABEL_OPTIONS,
  ONLINE_ORDER_STATUS_BADGE,
  OnlineOrderColumnKey,
  type OnlineOrderLabelOption,
} from "@erp/pos/constants/online-order-list.constant";
import type {
  OnlineOrderFilterOperators,
  OnlineOrderFilters,
  OnlineOrderOperatorKey,
} from "@erp/pos/hooks/page-hooks/online-order-list/use-online-order-list";
import type { SalesOrderRow } from "@erp/pos/interfaces/sales-order.interface";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";

export interface OnlineOrderTableProps {
  rows: ReadonlyArray<SalesOrderRow>;
  filters: OnlineOrderFilters;
  filterOperators: OnlineOrderFilterOperators;
  onFilterChange: (key: keyof OnlineOrderFilters, value: string) => void;
  onFilterOperatorChange: (
    key: OnlineOrderOperatorKey,
    op: FilterOperatorEnum,
  ) => void;
  selectedIds: ReadonlySet<string>;
  /** Ô tick chỉ bật khi có action dùng tới (UOW-02). */
  selectionDisabled: boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
}

const SELECT_COLUMN_KEY = "select";

/** "Tên · SĐT · địa chỉ, phường, tỉnh" — bỏ phần trống. */
function deliveryInfoText(row: SalesOrderRow): string {
  const address = [row.shipAddressLine, row.shipWardName, row.shipProvinceName]
    .filter(Boolean)
    .join(", ");
  return [row.recipientName, row.recipientPhone, address]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Lưới "Đơn hàng Online" — ô tick + 10 cột (A-11), hàng lọc theo cột cùng
 * kiểu toán tử với DS hoá đơn: `*` cho chữ, `≤` cho số và ngày.
 */
export function OnlineOrderTable({
  rows,
  filters,
  filterOperators,
  onFilterChange,
  onFilterOperatorChange,
  selectedIds,
  selectionDisabled,
  onToggleRow,
  onToggleAll,
}: OnlineOrderTableProps) {
  const columns = useMemo<PosDataTableColumn<SalesOrderRow>[]>(() => {
    const textFilter = (key: OnlineOrderOperatorKey) => (
      <PosDataTableFilterCell
        value={filters[key]}
        onChange={(next) => onFilterChange(key, next)}
        operatorType={FilterOperatorTypeEnum.TEXT}
        leadingOperator={FilterOperatorEnum.CONTAINS}
        operator={filterOperators[key]}
        onOperatorChange={(op) => onFilterOperatorChange(key, op)}
      />
    );
    const compareFilter = (
      key: OnlineOrderOperatorKey,
      placeholder?: string,
      align?: "left" | "right",
    ) => (
      <PosDataTableFilterCell
        value={filters[key]}
        onChange={(next) => onFilterChange(key, next)}
        operatorType={FilterOperatorTypeEnum.NUMBER}
        leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
        operator={filterOperators[key]}
        onOperatorChange={(op) => onFilterOperatorChange(key, op)}
        placeholder={placeholder}
        align={align}
      />
    );

    const allChecked =
      rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

    const byKey: Record<
      OnlineOrderColumnKey,
      Omit<PosDataTableColumn<SalesOrderRow>, "key" | "title">
    > = {
      [OnlineOrderColumnKey.ExternalOrderId]: {
        headerClassName: "min-w-[160px] whitespace-nowrap",
        cellClassName: "font-medium",
        render: (row) => row.externalOrderId ?? "",
        filterRender: textFilter("externalOrderId"),
      },
      [OnlineOrderColumnKey.OrderDate]: {
        headerClassName: "min-w-[160px] whitespace-nowrap",
        cellClassName: "whitespace-nowrap",
        render: (row) => formatViDateTime(row.createdAt),
        filterRender: compareFilter("orderDate", "dd/mm/yyyy"),
      },
      [OnlineOrderColumnKey.DeliveryInfo]: {
        headerClassName: "min-w-[260px] whitespace-nowrap",
        render: (row) => deliveryInfoText(row),
        filterRender: textFilter("deliveryInfo"),
      },
      [OnlineOrderColumnKey.AmountDue]: {
        align: "right",
        headerClassName: "min-w-[140px] whitespace-nowrap",
        cellClassName: "tabular-nums",
        render: (row) => formatVnd(row.amountDue),
        filterRender: compareFilter("amountDue", undefined, "right"),
      },
      [OnlineOrderColumnKey.Status]: {
        headerClassName: "min-w-[120px] whitespace-nowrap",
        cellClassName: "whitespace-nowrap",
        render: (row) => {
          const badge =
            row.status === "DRAFT" ? null : ONLINE_ORDER_STATUS_BADGE[row.status];
          return badge ? (
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          ) : null;
        },
      },
      [OnlineOrderColumnKey.DeliveryPartnerName]: {
        headerClassName: "min-w-[140px] whitespace-nowrap",
        render: (row) => row.deliveryPartnerName ?? "",
        filterRender: textFilter("deliveryPartnerName"),
      },
      [OnlineOrderColumnKey.SalespersonName]: {
        headerClassName: "min-w-[140px] whitespace-nowrap",
        render: (row) => row.salespersonName ?? "",
        filterRender: textFilter("salespersonName"),
      },
      [OnlineOrderColumnKey.InvoiceCode]: {
        headerClassName: "min-w-[140px] whitespace-nowrap",
        render: (row) => row.invoiceCode ?? "",
        filterRender: textFilter("invoiceCode"),
      },
      [OnlineOrderColumnKey.Note]: {
        headerClassName: "min-w-[160px] whitespace-nowrap",
        render: (row) => row.note ?? "",
        filterRender: textFilter("note"),
      },
      [OnlineOrderColumnKey.Label]: {
        headerClassName: "min-w-[120px] whitespace-nowrap",
        cellClassName: "whitespace-nowrap",
        render: (row) =>
          row.stockShort ? (
            <span className="inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-[12px] font-medium text-orange-700">
              Thiếu hàng
            </span>
          ) : null,
        filterRender: (
          <PosSelect<OnlineOrderLabelOption>
            value={
              ONLINE_ORDER_LABEL_OPTIONS.find((o) => o.value === filters.label) ??
              null
            }
            onChange={(item) => onFilterChange("label", item.value)}
            items={ONLINE_ORDER_LABEL_OPTIONS}
            itemKey={(o) => o.value || "all"}
            renderItem={(o) => o.label}
            ariaLabel="Lọc theo nhãn"
            variant="underline"
          />
        ),
      },
    };

    return [
      {
        key: SELECT_COLUMN_KEY,
        title: (
          <PosCheckbox
            checked={allChecked}
            onChange={onToggleAll}
            disabled={selectionDisabled}
            ariaLabel="Chọn tất cả đơn"
          />
        ),
        headerClassName: "w-10",
        cellClassName: "w-10",
        render: (row) => (
          <PosCheckbox
            checked={selectedIds.has(row.id)}
            onChange={() => onToggleRow(row.id)}
            disabled={selectionDisabled}
            ariaLabel="Chọn đơn"
          />
        ),
      },
      ...ONLINE_ORDER_COLUMN_ORDER.map((key) => ({
        key,
        title: ONLINE_ORDER_COLUMN_LABELS[key],
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
    selectionDisabled,
    onToggleRow,
    onToggleAll,
  ]);

  return (
    <div className="h-full min-h-0 overflow-auto">
      <PosDataTable<SalesOrderRow>
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.id}
        emptyText="Không có đơn hàng nào!"
        hasBorder={false}
      />
    </div>
  );
}
