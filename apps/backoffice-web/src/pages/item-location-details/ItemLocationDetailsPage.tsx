import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { DocumentListShell, PageToolbar } from "@erp/ui";
import type { StockByLocationItem } from "@erp/shared-interfaces";
import { buildItemLocationToolbarItems } from "./ItemLocationDetailsToolbar";
import { BaseDataTable } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import type { ColumnFilter, ColumnFilterMode } from "../../components/table/pagination.dto";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  listLocationStockItems,
  listStockBalances,
  type StockBalanceRow,
} from "../../api/stock-balances";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  buildItemLocationColumns,
  buildLocationStockItemColumns,
} from "./ItemLocationDetailsColumns";
import { buildQuery } from "./ItemLocationDetailsQuery";
import { ArrangeLocationDialog } from "./ArrangeLocationDialog";
import { TransferLocationDialog } from "./TransferLocationDialog";

const naturalCollator = new Intl.Collator("vi-VN", {
  numeric: true,
  sensitivity: "base",
});

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return naturalCollator.compare(a ?? "", b ?? "");
}

function sortStockRowsByLocation(rows: StockBalanceRow[]) {
  return [...rows].sort(
    (a, b) =>
      compareText(a.location.code, b.location.code) ||
      compareText(a.location.name, b.location.name) ||
      compareText(a.item.code, b.item.code) ||
      compareText(a.item.name, b.item.name),
  );
}

function sortLocationRowsBySku(rows: StockByLocationItem[]) {
  return [...rows].sort(
    (a, b) =>
      compareText(a.code, b.code) ||
      compareText(a.name, b.name) ||
      compareText(a.variantLabel, b.variantLabel),
  );
}

export function ItemLocationDetailsPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get("locationId")?.trim() || "";
  const isLocationDetail = Boolean(locationId);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [filters, locationId]);

  const queryParams = useMemo(
    () => buildQuery(page, pageSize, filters),
    [page, pageSize, filters],
  );
  const locationSearch =
    filters.itemCode?.value?.trim() ||
    filters.itemName?.value?.trim() ||
    undefined;

  const stockQuery = useQuery({
    queryKey: ["stock-balances", queryParams],
    queryFn: () => listStockBalances(queryParams),
    enabled: !isLocationDetail,
  });

  const locationQuery = useQuery({
    queryKey: [
      "location-stock-items",
      locationId,
      page,
      pageSize,
      locationSearch,
      "code",
      "asc",
    ],
    queryFn: () =>
      listLocationStockItems(locationId, {
        page,
        pageSize,
        search: locationSearch,
        sortBy: "code",
        sortOrder: "asc",
      }),
    enabled: isLocationDetail,
  });

  const isFetching = isLocationDetail
    ? locationQuery.isFetching
    : stockQuery.isFetching;
  const activeError = isLocationDetail ? locationQuery.error : stockQuery.error;
  const isError = isLocationDetail ? locationQuery.isError : stockQuery.isError;

  useEffect(() => {
    if (isError && activeError) {
      toast.error(getUserFacingApiErrorMessage(activeError));
    }
  }, [isError, activeError]);

  const stockRows = useMemo(
    () => sortStockRowsByLocation(stockQuery.data?.data ?? []),
    [stockQuery.data?.data],
  );
  const locationRows = useMemo(
    () => sortLocationRowsBySku(locationQuery.data?.data ?? []),
    [locationQuery.data?.data],
  );
  const total = isLocationDetail
    ? (locationQuery.data?.meta.total ?? 0)
    : (stockQuery.data?.total ?? 0);
  const locationTitle = locationQuery.data
    ? `${locationQuery.data.meta.location.storage.name} - ${locationQuery.data.meta.location.code} · ${locationQuery.data.meta.location.name}`
    : null;
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

  const currentRowKeys = useMemo(
    () =>
      isLocationDetail
        ? locationRows.map((r) => r.itemId)
        : stockRows.map((r) => r.id),
    [isLocationDetail, locationRows, stockRows],
  );

  const allOnPageSelected =
    currentRowKeys.length > 0 && currentRowKeys.every((id) => selectedIds.has(id));
  const someOnPageSelected =
    !allOnPageSelected &&
    currentRowKeys.some((id) => selectedIds.has(id));

  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const id of currentRowKeys) next.delete(id);
      } else {
        for (const id of currentRowKeys) next.add(id);
      }
      return next;
    });

  const stockRowIndexMap = useMemo(
    () =>
      new Map(
        stockRows.map((r, i) => [r.id, (page - 1) * pageSize + i + 1]),
      ),
    [stockRows, page, pageSize],
  );
  const locationRowIndexMap = useMemo(
    () =>
      new Map(
        locationRows.map((r, i) => [
          r.itemId,
          (page - 1) * pageSize + i + 1,
        ]),
      ),
    [locationRows, page, pageSize],
  );

  const stockColumns = useMemo(
    () => buildItemLocationColumns(stockRowIndexMap),
    [stockRowIndexMap],
  );
  const locationColumns = useMemo(
    () => buildLocationStockItemColumns(locationRowIndexMap),
    [locationRowIndexMap],
  );

  const leadingHeader = (
    <input
      type="checkbox"
      aria-label="Chọn tất cả dòng trên trang"
      checked={allOnPageSelected}
      ref={(el) => {
        if (el) el.indeterminate = someOnPageSelected;
      }}
      onChange={togglePage}
    />
  );

  const stockLeadingColumn = {
    width: 36,
    header: leadingHeader,
    filterHeader: null,
    cell: (row: StockBalanceRow) => (
      <input
        type="checkbox"
        aria-label={`Chọn dòng ${row.item.code}`}
        checked={selectedIds.has(row.id)}
        onChange={() => toggleRow(row.id)}
      />
    ),
    cellClassName: "text-center",
    headerClassName: "text-center",
  };

  const locationLeadingColumn = {
    width: 36,
    header: leadingHeader,
    filterHeader: null,
    cell: (row: StockByLocationItem) => (
      <input
        type="checkbox"
        aria-label={`Chọn dòng ${row.code}`}
        checked={selectedIds.has(row.itemId)}
        onChange={() => toggleRow(row.itemId)}
      />
    ),
    cellClassName: "text-center",
    headerClassName: "text-center",
  };

  const reload = useCallback(
    () =>
      qc.invalidateQueries({
        queryKey: isLocationDetail ? ["location-stock-items"] : ["stock-balances"],
      }),
    [qc, isLocationDetail],
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
        title={
          <InventoryPageTitle>
            {locationTitle
              ? `Chi tiết vị trí hàng hóa: ${locationTitle}`
              : "Chi tiết vị trí hàng hóa"}
          </InventoryPageTitle>
        }
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
        {isLocationDetail ? (
          <BaseDataTable
            columns={locationColumns}
            rows={locationRows}
            loading={isFetching}
            emptyLabel="Vị trí này chưa có hàng hóa nào."
            getRowKey={(r) => r.itemId}
            leadingColumn={locationLeadingColumn}
            columnFilterControl={{ filters, onModeChange, onValueChange }}
          />
        ) : (
          <BaseDataTable
            columns={stockColumns}
            rows={stockRows}
            loading={isFetching}
            emptyLabel="Không có dữ liệu phù hợp với bộ lọc."
            getRowKey={(r) => r.id}
            leadingColumn={stockLeadingColumn}
            columnFilterControl={{ filters, onModeChange, onValueChange }}
          />
        )}
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
