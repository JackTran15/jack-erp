import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  navigateToBarcodePrint,
  type BarcodePrefillItem,
} from "../../lib/barcode-print-navigation";
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
import { BaseDataTable } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import type { ColumnFilter, ColumnFilterMode } from "../../components/table/pagination.dto";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  listLocationStockItems,
  listStockBalances,
  setBalancesTracking,
  type BalanceTrackingEntry,
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
  const navigate = useNavigate();
  const locationId = searchParams.get("locationId")?.trim() || "";
  const isLocationDetail = Boolean(locationId);
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({
    isTracked: { mode: "equals", value: "true" },
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
      params.set("activeOnly", "true");
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
          isTracked: row.isTracked,
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

  // Hàng đang chọn → đổ sẵn sang trang In tem mã. Cả 2 chế độ mang theo số lượng
  // tồn tại vị trí (= số lượng tem). Chế độ 1-vị-trí còn giữ giá bán (từ
  // locationRows); chế độ tổng quan không có giá → trang in tem tự resolve sau.
  const barcodePrefillItems = useMemo<BarcodePrefillItem[]>(() => {
    if (isLocationDetail) {
      const location = locationQuery.data?.meta.location;
      if (!location) return [];
      return locationRows
        .filter((row) => selectedIds.has(row.itemId))
        .map((row) => ({
          itemId: row.itemId,
          sku: row.code,
          name: row.name,
          unit: row.unit,
          sellingPrice: Number(row.sellingPrice) || 0,
          quantity: row.quantity,
          storageId: location.storage.id,
          storageName: location.storage.name,
          locationId: location.id,
          locationCode: location.code,
        }));
    }
    return stockRows
      .filter((row) => selectedIds.has(row.id))
      .map((row) => ({
        itemId: row.itemId,
        sku: row.item.code,
        name: row.item.name,
        unit: row.item.unit,
        sellingPrice: 0,
        quantity: row.quantity,
        storageId: row.location.storageId,
        storageName: row.location.storageName,
        locationId: row.location.id,
        locationCode: row.location.code,
      }));
  }, [
    isLocationDetail,
    locationQuery.data?.meta.location,
    locationRows,
    selectedIds,
    stockRows,
  ]);

  // Ngừng theo dõi áp dụng cấp vị trí: mỗi cặp (hàng hóa × vị trí) là một dòng riêng.
  const selectedTrackingEntries = useMemo<BalanceTrackingEntry[]>(() => {
    const seen = new Set<string>();
    const entries: BalanceTrackingEntry[] = [];
    for (const row of selectedTransferRows) {
      const key = `${row.itemId}:${row.locationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ itemId: row.itemId, locationId: row.locationId });
    }
    return entries;
  }, [selectedTransferRows]);
  // Chỉ ngừng theo dõi khi selection còn ít nhất 1 vị trí đang theo dõi VÀ
  // tất cả vị trí đã chọn đều tồn = 0 — còn tồn thì số liệu sẽ biến mất khỏi báo cáo.
  const canStopTracking = useMemo(
    () =>
      selectedTransferRows.some((row) => row.isTracked) &&
      selectedTransferRows.every((row) => Number(row.quantity) === 0),
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
    if (selectedTrackingEntries.length === 0) return;
    // Guard sớm ở FE (backend vẫn là chốt chặn cuối): còn tồn thì không cho ngừng.
    const stillHasStock = selectedTransferRows.filter(
      (row) => Number(row.quantity) > 0,
    );
    if (stillHasStock.length) {
      toast.error(
        `Chỉ được ngừng theo dõi khi tồn = 0. Còn ${stillHasStock.length} vị trí đang có tồn.`,
      );
      return;
    }
    setStopSubmitting(true);
    try {
      await setBalancesTracking(selectedTrackingEntries, false);
      toast.success(
        `Đã ngừng theo dõi ${selectedTrackingEntries.length} vị trí hàng hóa.`,
      );
      setSelectedIds(new Set());
      void reload();
      setStopConfirmOpen(false);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setStopSubmitting(false);
    }
  }, [selectedTrackingEntries, selectedTransferRows, reload]);

  const toolbarItems = useMemo(
    () =>
      buildItemLocationToolbarItems({
        isFetching,
        hasSelection,
        canStopTracking,
        onReload: reload,
        onStopTracking: () => setStopConfirmOpen(true),
        onOpenArrange: () => setArrangeOpen(true),
        onOpenTransfer: () => setTransferOpen(true),
        onPrintLabel: () =>
          navigateToBarcodePrint(
            navigate,
            "/inventory/item-location-details",
            barcodePrefillItems.length ? barcodePrefillItems : undefined,
          ),
      }),
    [
      isFetching,
      hasSelection,
      canStopTracking,
      reload,
      navigate,
      barcodePrefillItems,
    ],
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
        selectedRows={selectedTransferRows}
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
            <DialogTitle>Ngừng theo dõi vị trí hàng hóa</DialogTitle>
            <DialogDescription>
              {`Bạn có chắc muốn ngừng theo dõi ${selectedTrackingEntries.length} vị trí đã chọn? Hàng hóa vẫn được theo dõi ở các vị trí khác và vẫn tìm được.`}
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
