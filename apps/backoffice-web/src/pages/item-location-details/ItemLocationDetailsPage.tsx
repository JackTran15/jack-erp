import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DocumentListShell,
  PageToolbar,
} from "@erp/ui";
import type { StockByLocationItem } from "@erp/shared-interfaces";
import { buildItemLocationToolbarItems } from "./ItemLocationDetailsToolbar";
import { setItemsActiveStatus } from "../../api/inventory-items";
import { BaseDataTable } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import type { ColumnFilter, ColumnFilterMode } from "../../components/table/pagination.dto";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  listLocationStockItems,
  listStockBalances,
  type PaginatedResponse,
  type StockBalanceRow,
} from "../../api/stock-balances";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { getActiveBranch } from "../../lib/auth-storage";
import { apiClient } from "../../lib/api-axios";
import {
  buildItemLocationColumns,
  buildLocationStockItemColumns,
} from "./ItemLocationDetailsColumns";
import { buildQuery } from "./ItemLocationDetailsQuery";
import { ArrangeLocationDialog } from "./ArrangeLocationDialog";
import { TransferLocationDialog } from "./TransferLocationDialog";

interface InventoryStorage {
  id: string;
  name: string;
}

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
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({
    isActive: { mode: "equals", value: "true" },
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const activeBranchId = getActiveBranch();

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
    queryKey: ["stock-balances", activeBranchId, queryParams],
    queryFn: () => listStockBalances(queryParams),
    enabled: !isLocationDetail,
  });

  const storagesQuery = useQuery({
    queryKey: ["inventory-storages", activeBranchId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (activeBranchId) params.set("branchId", activeBranchId);
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        `/inventory/storages?${params}`,
      );
      return data.data;
    },
    enabled: !isLocationDetail,
  });

  const locationQuery = useQuery({
    queryKey: [
      "location-stock-items",
      activeBranchId,
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
  const selectedTransferRows = useMemo<StockBalanceRow[]>(() => {
    if (isLocationDetail) {
      const location = locationQuery.data?.meta.location;
      if (!location) return [];
      return locationRows
        .filter((row) => selectedIds.has(row.itemId))
        .map((row) => ({
          id: `${location.id}:${row.itemId}`,
          itemId: row.itemId,
          locationId: location.id,
          quantity: row.quantity,
          lastMovementAt: row.lastMovementAt,
          item: {
            id: row.itemId,
            code: row.code,
            name: row.name,
            unit: row.unit,
            categoryName: row.categoryName,
            isActive: row.isActive,
          },
          location: {
            id: location.id,
            code: location.code,
            name: location.name,
            storageId: location.storage.id,
            storageName: location.storage.name,
          },
        }));
    }
    return stockRows.filter((row) => selectedIds.has(row.id));
  }, [
    isLocationDetail,
    locationQuery.data?.meta.location,
    locationRows,
    selectedIds,
    stockRows,
  ]);

  // Ngừng theo dõi áp dụng cấp item; một item ở nhiều vị trí → dedupe theo item id.
  const selectedItemIds = useMemo(
    () => Array.from(new Set(selectedTransferRows.map((row) => row.item.id))),
    [selectedTransferRows],
  );

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

  const storageFilterOptions = useMemo(
    () => (storagesQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [storagesQuery.data],
  );

  const stockColumns = useMemo(
    () => buildItemLocationColumns(stockRowIndexMap, storageFilterOptions),
    [stockRowIndexMap, storageFilterOptions],
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

  const confirmStopTracking = useCallback(async () => {
    if (selectedItemIds.length === 0) return;
    setStopSubmitting(true);
    try {
      await setItemsActiveStatus(selectedItemIds, false);
      toast.success(`Đã ngừng theo dõi ${selectedItemIds.length} hàng hóa.`);
      setSelectedIds(new Set());
      void reload();
      setStopConfirmOpen(false);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setStopSubmitting(false);
    }
  }, [selectedItemIds, reload]);

  const toolbarItems = useMemo(
    () =>
      buildItemLocationToolbarItems({
        isFetching,
        hasSelection,
        onReload: reload,
        onStopTracking: () => setStopConfirmOpen(true),
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
        toolbar={
          <PageToolbar
            items={toolbarItems}
            tone="primary"
            className="m-2 rounded-md"
          />
        }
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
        selectedRows={selectedTransferRows}
      />
      <Dialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ngừng theo dõi hàng hóa</DialogTitle>
            <DialogDescription>
              {`Bạn có chắc muốn ngừng theo dõi ${selectedItemIds.length} hàng hóa trong vị trí đã chọn?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStopConfirmOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={stopSubmitting}
              onClick={() => void confirmStopTracking()}
            >
              {stopSubmitting ? "Đang xử lý..." : "Ngừng theo dõi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
