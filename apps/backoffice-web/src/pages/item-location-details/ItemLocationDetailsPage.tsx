import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DocumentListShell, PageToolbar } from "@erp/ui";
import { buildItemLocationToolbarItems } from "./ItemLocationDetailsToolbar";
import { BaseDataTable } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import type { ColumnFilter, ColumnFilterMode } from "../../components/table/pagination.dto";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  listStockBalances,
  type StockBalanceRow,
} from "../../api/stock-balances";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { buildItemLocationColumns } from "./ItemLocationDetailsColumns";
import { buildQuery } from "./ItemLocationDetailsQuery";
import { ArrangeLocationDialog } from "./ArrangeLocationDialog";
import { TransferLocationDialog } from "./TransferLocationDialog";

export function ItemLocationDetailsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const queryParams = useMemo(
    () => buildQuery(page, pageSize, filters),
    [page, pageSize, filters],
  );

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["stock-balances", queryParams],
    queryFn: () => listStockBalances(queryParams),
  });

  useEffect(() => {
    if (isError && error) {
      toast.error(getUserFacingApiErrorMessage(error));
    }
  }, [isError, error]);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasSelection = selectedIds.size > 0;

  const onModeChange = (fieldKey: string, mode: ColumnFilterMode) => {
    setFilters((prev) => ({
      ...prev,
      [fieldKey]: { mode, value: prev[fieldKey]?.value ?? "" },
    }));
  };
  const onValueChange = (fieldKey: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [fieldKey]: { mode: prev[fieldKey]?.mode ?? "contains", value },
    }));
  };

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someOnPageSelected =
    !allOnPageSelected && rows.some((r) => selectedIds.has(r.id));

  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const r of rows) next.delete(r.id);
      } else {
        for (const r of rows) next.add(r.id);
      }
      return next;
    });

  const rowIndexMap = useMemo(
    () => new Map(rows.map((r, i) => [r.id, (page - 1) * pageSize + i + 1])),
    [rows, page, pageSize],
  );

  const columns = useMemo(
    () => buildItemLocationColumns(rowIndexMap),
    [rowIndexMap],
  );

  const leadingColumn = {
    width: 36,
    header: (
      <input
        type="checkbox"
        aria-label="Chọn tất cả dòng trên trang"
        checked={allOnPageSelected}
        ref={(el) => {
          if (el) el.indeterminate = someOnPageSelected;
        }}
        onChange={togglePage}
      />
    ),
    filterHeader: null,
    cell: (_r: StockBalanceRow, _index: number) => (
      <input
        type="checkbox"
        aria-label={`Chọn dòng ${_r.item.code}`}
        checked={selectedIds.has(_r.id)}
        onChange={() => toggleRow(_r.id)}
      />
    ),
    cellClassName: "text-center",
    headerClassName: "text-center",
  };

  const reload = useCallback(
    () => qc.invalidateQueries({ queryKey: ["stock-balances"] }),
    [qc],
  );

  const toolbarItems = useMemo(
    () =>
      buildItemLocationToolbarItems({
        isFetching,
        hasSelection,
        onReload: reload,
        onOpenArrange: () => setArrangeOpen(true),
        onOpenTransfer: () => setTransferOpen(true),
      }),
    [isFetching, hasSelection, reload],
  );

  return (
    <>
      <DocumentListShell
        title="Chi tiết vị trí hàng hóa"
        tabs={<InventoryTabBar activeId="item-location-details" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        pagination={
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
            pageSizeOptions={[20, 50, 100, 200]}
            onRefresh={reload}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={rows}
          loading={isFetching}
          emptyLabel="Không có dữ liệu phù hợp với bộ lọc."
          getRowKey={(r) => r.id}
          leadingColumn={leadingColumn}
          columnFilterControl={{ filters, onModeChange, onValueChange }}
        />
      </DocumentListShell>
      <ArrangeLocationDialog
        open={arrangeOpen}
        onOpenChange={setArrangeOpen}
        onSaved={reload}
      />
      <TransferLocationDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onSaved={reload}
      />
    </>
  );
}
