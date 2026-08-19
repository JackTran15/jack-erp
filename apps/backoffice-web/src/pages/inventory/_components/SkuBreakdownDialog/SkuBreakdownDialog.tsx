import { useMemo, useState } from "react";
import { AppModal, Button, formatMoneyInteger } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  searchSkuBreakdown,
  type SkuBreakdownRow,
} from "../../../../api/stock-summary";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import { useColumnFilters } from "../../../../components/table/useColumnFilters";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../../../components/crud/crudV2Search";
import { useDebouncedValue } from "../../../../lib/use-debounced-value";
import {
  StockLedgerCardDialog,
  type StockLedgerCardTarget,
} from "../StockLedgerCardDialog/StockLedgerCardDialog";

export interface SkuBreakdownTarget {
  groupKey: string;
  code: string;
  name: string;
  storageId: string;
  storageName: string;
}

interface Props {
  target: SkuBreakdownTarget | null;
  period: { from?: string; to?: string };
  onClose: () => void;
}

const FILTER_KEYS = [
  "itemCode",
  "itemName",
  "unit",
  "locationCode",
  "locationName",
  "quantity",
  "openingQty",
  "inQty",
  "outQty",
  "transferOutQty",
  "incomingQty",
] as const;

const SEARCH_CONFIG: V2SearchConfig = {
  path: "/v2/inventory/stock/summary/sku-breakdown",
  fields: {
    itemCode: "string",
    itemName: "string",
    unit: "string",
    locationCode: "string",
    locationName: "string",
    quantity: "compare",
    openingQty: "compare",
    inQty: "compare",
    outQty: "compare",
    transferOutQty: "compare",
    incomingQty: "compare",
  },
};

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function SkuBreakdownDialog({ target, period, onClose }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [ledgerTarget, setLedgerTarget] =
    useState<StockLedgerCardTarget | null>(null);
  const { filters, control } = useColumnFilters(FILTER_KEYS, {
    onChange: () => setPage(1),
  });
  const debouncedFilters = useDebouncedValue(filters, 300);

  const body = useMemo(
    () => ({
      ...buildV2Body(SEARCH_CONFIG, debouncedFilters, page, pageSize),
      groupKey: target?.groupKey,
      storageId: target?.storageId,
      startDate: period.from || undefined,
      endDate: period.to || undefined,
    }),
    [debouncedFilters, page, pageSize, period.from, period.to, target],
  );

  const breakdownQuery = useQuery({
    queryKey: ["sku-breakdown", body],
    queryFn: () => searchSkuBreakdown(body),
    enabled: Boolean(target),
    placeholderData: (previous) => previous,
  });

  const response = breakdownQuery.isError ? undefined : breakdownQuery.data;
  const totals = response?.totals;

  const columns = useMemo<TableColumn<SkuBreakdownRow>[]>(() => {
    const quantity = (
      key: string,
      label: string,
      valueOf: (row: SkuBreakdownRow) => number,
      total: number | undefined,
      /** Blank instead of 0 on rows the figure does not belong to. */
      onlyOnAnchor = false,
    ): TableColumn<SkuBreakdownRow> => ({
      key,
      label,
      width: 115,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) =>
        onlyOnAnchor && !row.isPendingAnchor
          ? ""
          : formatMoneyInteger(valueOf(row)),
      footer:
        total === undefined ? null : (
          <span className="block text-right font-semibold tabular-nums">
            {formatMoneyInteger(total)}
          </span>
        ),
    });

    return [
      {
        key: "itemCode",
        label: "Mã SKU",
        width: 160,
        render: (row) => <span className="font-mono text-xs">{row.itemCode}</span>,
      },
      {
        key: "itemName",
        label: "Tên hàng hóa",
        width: 220,
        render: (row) => (
          <button
            type="button"
            className="text-left text-primary-blue hover:underline"
            onClick={() =>
              target &&
              setLedgerTarget({
                itemId: row.itemId,
                itemCode: row.itemCode,
                itemName: row.itemName,
                storageId: target.storageId,
                storageName: target.storageName,
              })
            }
          >
            {row.itemName}
          </button>
        ),
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        width: 110,
        render: (row) => row.unit,
      },
      {
        key: "locationCode",
        label: "Mã vị trí",
        width: 150,
        render: (row) => row.locationCode,
      },
      {
        key: "locationName",
        label: "Tên vị trí",
        width: 150,
        render: (row) => row.locationName,
      },
      quantity("quantity", "SL tồn", (row) => row.quantity, totals?.quantity),
      quantity("openingQty", "Tồn đầu kỳ", (row) => row.openingQty, totals?.openingQty),
      quantity("inQty", "SL nhập", (row) => row.inQty, totals?.inQty),
      quantity("outQty", "SL xuất", (row) => row.outQty, totals?.outQty),
      quantity(
        "transferOutQty",
        "Đang chuyển đi",
        (row) => row.transferOutQty,
        totals?.transferOutQty,
        true,
      ),
      quantity(
        "incomingQty",
        "Sắp nhận về",
        (row) => row.incomingQty,
        totals?.incomingQty,
        true,
      ),
    ];
  }, [target, totals]);

  return (
    <>
      <AppModal
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Chi tiết hàng hóa"
        defaultWidth={1000}
        defaultHeight={640}
        bodyClassName="overflow-hidden"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />
              Đóng
            </Button>
          </div>
        }
      >
        <div className="flex h-full flex-col gap-2 pt-2">
          <div className="text-center">
            <h2 className="text-base font-bold uppercase tracking-wide">
              Chi tiết hàng hóa
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {describePeriod(period)} · Mã SKU{" "}
              <span className="font-semibold text-foreground">
                {target?.code}
              </span>{" "}
              · Tên hàng hóa{" "}
              <span className="font-semibold text-foreground">
                {target?.name}
              </span>{" "}
              · Kho{" "}
              <span className="font-semibold text-foreground">
                {target?.storageName}
              </span>
            </p>
          </div>

          <div className="min-h-0 flex-1">
            <BaseDataTable
              columns={columns}
              rows={response?.data ?? []}
              loading={breakdownQuery.isLoading}
              emptyLabel={
                breakdownQuery.isError
                  ? "Không thể tải chi tiết hàng hóa."
                  : "Không có hàng hóa nào trong kho này."
              }
              getRowKey={(row) => `${row.itemId}:${row.locationId}`}
              columnFilterControl={control}
            />
          </div>

          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">
              Số hàng hóa = {response?.itemCount ?? 0}
            </span>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={response?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              onRefresh={() => void breakdownQuery.refetch()}
            />
          </div>
        </div>
      </AppModal>

      <StockLedgerCardDialog
        target={ledgerTarget}
        period={period}
        onClose={() => setLedgerTarget(null)}
      />
    </>
  );
}

function describePeriod(period: { from?: string; to?: string }): string {
  if (!period.from && !period.to) return "Toàn bộ thời gian";
  const format = (value?: string) =>
    value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : "…";
  return `Từ ${format(period.from)} đến ${format(period.to)}`;
}
