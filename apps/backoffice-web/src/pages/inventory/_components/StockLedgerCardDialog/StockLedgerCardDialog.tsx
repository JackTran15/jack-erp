import { useMemo, useState } from "react";
import { AppModal, Button, formatMoneyInteger } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  searchStockLedgerCard,
  type StockLedgerCardRow,
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

export interface StockLedgerCardTarget {
  itemId: string;
  itemCode: string;
  itemName: string;
  storageId: string;
  storageName: string;
}

interface Props {
  target: StockLedgerCardTarget | null;
  period: { from?: string; to?: string };
  onClose: () => void;
}

const FILTER_KEYS = [
  "documentType",
  "documentDate",
  "documentNumber",
  "description",
  "balanceQty",
  "inQty",
  "outQty",
] as const;

const SEARCH_CONFIG: V2SearchConfig = {
  path: "/v2/inventory/stock/summary/ledger-card",
  fields: {
    documentType: "string",
    documentDate: "date-compare",
    documentNumber: "string",
    description: "string",
    balanceQty: "compare",
    inQty: "compare",
    outQty: "compare",
  },
};

const OPENING_ROW_ID = "__opening__";

/** `data` plus the pinned "Số dư đầu kỳ" row the report opens with. */
type ViewRow = StockLedgerCardRow & { isOpening?: boolean };

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function StockLedgerCardDialog({ target, period, onClose }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { filters, control } = useColumnFilters(FILTER_KEYS, {
    onChange: () => setPage(1),
  });
  const debouncedFilters = useDebouncedValue(filters, 300);

  const body = useMemo(
    () => ({
      ...buildV2Body(SEARCH_CONFIG, debouncedFilters, page, pageSize),
      itemId: target?.itemId,
      storageId: target?.storageId,
      startDate: period.from || undefined,
      endDate: period.to || undefined,
    }),
    [debouncedFilters, page, pageSize, period.from, period.to, target],
  );

  const cardQuery = useQuery({
    queryKey: ["stock-ledger-card", body],
    queryFn: () => searchStockLedgerCard(body),
    enabled: Boolean(target),
    placeholderData: (previous) => previous,
  });

  const response = cardQuery.isError ? undefined : cardQuery.data;

  const rows = useMemo<ViewRow[]>(() => {
    const movements = response?.data ?? [];
    // The opening balance is not a movement — it only makes sense on the first
    // page, and only when nothing has been filtered away above it.
    if (page !== 1 || !response) return movements;
    return [
      {
        id: OPENING_ROW_ID,
        isOpening: true,
        documentType: "",
        documentTypeLabel: "",
        documentNumber: null,
        postedAt: "",
        description: "Số dư đầu kỳ",
        inQty: 0,
        outQty: 0,
        balanceQty: response.openingQty,
      },
      ...movements,
    ];
  }, [page, response]);

  const columns = useMemo<TableColumn<ViewRow>[]>(() => {
    const quantity = (
      key: string,
      label: string,
      valueOf: (row: ViewRow) => number,
      total: number | undefined,
    ): TableColumn<ViewRow> => ({
      key,
      label,
      width: 110,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      // The opening row only carries a balance; showing 0 in the other numeric
      // cells would read as "nothing moved", which is a different claim.
      render: (row) =>
        row.isOpening ? "" : formatMoneyInteger(valueOf(row)),
      footer:
        total === undefined ? null : (
          <span className="block text-right font-semibold tabular-nums">
            {formatMoneyInteger(total)}
          </span>
        ),
    });

    return [
      {
        key: "documentType",
        label: "Loại chứng từ",
        width: 230,
        filterKind: "select",
        filterOptions: response?.documentTypeOptions ?? [],
        render: (row) => row.documentTypeLabel,
      },
      {
        key: "documentDate",
        label: "Ngày chứng từ",
        width: 130,
        filterKind: "date-compare",
        className: "text-center tabular-nums",
        headerClassName: "text-center",
        render: (row) =>
          row.postedAt ? dateFormatter.format(new Date(row.postedAt)) : "",
      },
      {
        key: "documentNumber",
        label: "Số chứng từ",
        width: 130,
        render: (row) => row.documentNumber ?? "",
      },
      {
        key: "description",
        label: "Diễn giải",
        width: 200,
        render: (row) => row.description ?? "",
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        width: 110,
        filterKind: "none",
        render: () => response?.unit ?? "",
      },
      quantity(
        "balanceQty",
        "SL tồn",
        (row) => row.balanceQty,
        response ? response.closingQty : undefined,
      ),
      quantity(
        "inQty",
        "SL nhập",
        (row) => row.inQty,
        response?.totals.inQty,
      ),
      quantity(
        "outQty",
        "SL xuất",
        (row) => row.outQty,
        response?.totals.outQty,
      ),
      {
        key: "transferOutQty",
        label: "Đang chuyển đi",
        width: 120,
        filterKind: "none",
        headerClassName: "text-right",
        className: "text-right tabular-nums text-muted-foreground",
        // Pending transfers have posted nothing to the ledger, so no movement
        // row owns them. They belong to the (hàng hóa × kho) pair — footer only.
        render: () => "—",
        footer: response ? (
          <span className="block text-right font-semibold tabular-nums">
            {formatMoneyInteger(response.pendingTransferOutQty)}
          </span>
        ) : null,
      },
      {
        key: "incomingQty",
        label: "Sắp nhận về",
        width: 120,
        filterKind: "none",
        headerClassName: "text-right",
        className: "text-right tabular-nums text-muted-foreground",
        render: () => "—",
        footer: response ? (
          <span className="block text-right font-semibold tabular-nums">
            {formatMoneyInteger(response.pendingIncomingQty)}
          </span>
        ) : null,
      },
    ];
  }, [response]);

  return (
    <AppModal
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Chi tiết tồn kho"
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
            Chi tiết tồn kho
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {describePeriod(period)} · Mã SKU{" "}
            <span className="font-semibold text-foreground">
              {target?.itemCode}
            </span>{" "}
            · Tên hàng hóa{" "}
            <span className="font-semibold text-foreground">
              {target?.itemName}
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
            rows={rows}
            loading={cardQuery.isLoading}
            emptyLabel={
              cardQuery.isError
                ? "Không thể tải chi tiết tồn kho."
                : "Không có phát sinh tồn kho trong kỳ này."
            }
            getRowKey={(row) => row.id}
            columnFilterControl={control}
          />
        </div>

        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-muted-foreground">
            Số dòng = {response?.total ?? 0}
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
            onRefresh={() => void cardQuery.refetch()}
          />
        </div>
      </div>
    </AppModal>
  );
}

function describePeriod(period: { from?: string; to?: string }): string {
  if (!period.from && !period.to) return "Toàn bộ thời gian";
  const format = (value?: string) =>
    value ? dateFormatter.format(new Date(`${value}T00:00:00`)) : "…";
  return `Từ ${format(period.from)} đến ${format(period.to)}`;
}
