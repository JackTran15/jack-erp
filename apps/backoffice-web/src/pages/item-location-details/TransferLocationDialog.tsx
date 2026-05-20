import { useCallback, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { AppModal, Button } from "@erp/ui";
import { LookupField } from "../../components/forms/LookupField";
import { PaginationControls } from "../../components/table/PaginationControls";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { listStockBalances, type StockBalanceRow } from "../../api/stock-balances";
import { createIntraWarehouseTransfer } from "../../api/stock-transfers";

// ─── Types ───────────────────────────────────────────────────────────────────

interface InventoryStorage {
  id: string;
  name: string;
  isMainStorage?: boolean;
}

interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  storageName?: string;
}

interface ItemSearchResult {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface TransferRow {
  uid: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  storageName: string;
  sourceLocationCode: string;
  quantityOnHand: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const PAGE_SIZE = 50;

// ─── Component ───────────────────────────────────────────────────────────────

export function TransferLocationDialog({ open, onOpenChange, onSaved }: Props): ReactElement {
  // Storage state (primary control — filters Vị trí dropdowns)
  const [storageId, setStorageId] = useState("");
  const [storageLabel, setStorageLabel] = useState("");

  // Source location state
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [sourceLocationLabel, setSourceLocationLabel] = useState("");
  const [sourceLocationCode, setSourceLocationCode] = useState("");

  // Destination location state
  const [destLocationId, setDestLocationId] = useState("");
  const [destLocationLabel, setDestLocationLabel] = useState("");

  // Server-side paginated rows (current page only)
  const [serverRows, setServerRows] = useState<TransferRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasFetched, setHasFetched] = useState(false);

  // Manually added rows (cumulative across pages — never auto-cleared)
  const [customRows, setCustomRows] = useState<TransferRow[]>([]);

  // User-entered "Số lượng chuyển" — keyed by itemId so it survives pagination
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});

  // Cumulative known items across pages — needed to look up quantityOnHand
  // on save for items whose page is no longer in view.
  const [knownItems, setKnownItems] = useState<Map<string, TransferRow>>(new Map());

  // Status state
  const [loadingRows, setLoadingRows] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Lookup search functions ─────────────────────────────────────────────

  const searchStorages = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
      `/inventory/storages?${params}`,
    );
    return data.data;
  }, []);

  const searchLocationsInStorage = useCallback(
    (sid: string) => async (query: string) => {
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      if (query.trim()) params.set("search", query.trim());
      if (sid) params.set("storageId", sid);
      const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      return data.data;
    },
    [],
  );

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<ItemSearchResult>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  // ─── Fetch source rows for a given page ──────────────────────────────────

  const fetchPage = useCallback(
    async (pageNum: number, locationCode: string) => {
      if (!locationCode) return;
      setLoadingRows(true);
      try {
        const result = await listStockBalances({
          page: pageNum,
          pageSize: PAGE_SIZE,
          locationCode,
          locationCodeMode: "equals",
          quantity: 0,
          quantityOp: "gt",
        });
        const mapped = (result.data as StockBalanceRow[]).map<TransferRow>((r) => ({
          uid: crypto.randomUUID(),
          itemId: r.itemId,
          itemCode: r.item.code,
          itemName: r.item.name,
          unit: r.item.unit,
          storageName: r.location.storageName,
          sourceLocationCode: r.location.code,
          quantityOnHand: Number(r.quantity),
        }));
        setServerRows(mapped);
        setTotal(result.total);
        setHasFetched(true);
        // Accumulate into knownItems map so qty entered on this page survives
        setKnownItems((prev) => {
          const next = new Map(prev);
          mapped.forEach((r) => next.set(r.itemId, r));
          return next;
        });
        if (pageNum === 1 && mapped.length === 0) {
          toast.info("Vị trí này không có hàng tồn kho nào.");
        }
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      } finally {
        setLoadingRows(false);
      }
    },
    [],
  );

  const handleFetchClick = useCallback(() => {
    if (!sourceLocationCode) {
      toast.error("Vui lòng chọn vị trí hiện tại trước");
      return;
    }
    setPage(1);
    void fetchPage(1, sourceLocationCode);
  }, [sourceLocationCode, fetchPage]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      setPage(nextPage);
      void fetchPage(nextPage, sourceLocationCode);
    },
    [fetchPage, sourceLocationCode],
  );

  // ─── Custom row management ───────────────────────────────────────────────

  const emptyCustomRow = useCallback(
    (): TransferRow => ({
      uid: crypto.randomUUID(),
      itemId: "",
      itemCode: "",
      itemName: "",
      unit: "",
      storageName: "",
      sourceLocationCode: "",
      quantityOnHand: 0,
    }),
    [],
  );

  const addCustomRow = useCallback(() => {
    setCustomRows((prev) => [...prev, emptyCustomRow()]);
  }, [emptyCustomRow]);

  const removeCustomRow = useCallback((uid: string) => {
    setCustomRows((prev) => prev.filter((r) => r.uid !== uid));
  }, []);

  const selectItemForCustomRow = useCallback(
    async (rowUid: string, item: ItemSearchResult) => {
      if (!sourceLocationId || !sourceLocationCode) {
        toast.error("Chọn vị trí hiện tại trước khi thêm hàng hoá");
        return;
      }
      // Reject duplicate items already in any row
      const dup =
        serverRows.some((r) => r.itemId === item.id) ||
        customRows.some((r) => r.itemId === item.id && r.uid !== rowUid);
      if (dup) {
        toast.warning(`SKU ${item.code} đã có trong bảng`);
        return;
      }
      // Fetch balance at source location for this SKU
      try {
        const result = await listStockBalances({
          page: 1,
          pageSize: 1,
          itemId: item.id,
          locationCode: sourceLocationCode,
          locationCodeMode: "equals",
        });
        const bal = (result.data as StockBalanceRow[])[0];
        if (!bal || Number(bal.quantity) <= 0) {
          toast.error(`SKU ${item.code} không có tồn ở vị trí ${sourceLocationCode}`);
          return;
        }
        const updated: TransferRow = {
          uid: rowUid,
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          unit: item.unit,
          storageName: bal.location.storageName,
          sourceLocationCode: bal.location.code,
          quantityOnHand: Number(bal.quantity),
        };
        setCustomRows((prev) => prev.map((r) => (r.uid === rowUid ? updated : r)));
        setKnownItems((prev) => {
          const next = new Map(prev);
          next.set(item.id, updated);
          return next;
        });
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [serverRows, customRows, sourceLocationId, sourceLocationCode],
  );

  // ─── Qty input handling ──────────────────────────────────────────────────

  const updateQty = useCallback((itemId: string, val: string) => {
    setQtyByItem((prev) => ({ ...prev, [itemId]: val }));
  }, []);

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!sourceLocationId || !destLocationId) {
      toast.error("Vui lòng chọn 2 vị trí");
      return;
    }

    const lines: { itemId: string; quantity: number }[] = [];
    let overflow = 0;
    for (const [itemId, qtyStr] of Object.entries(qtyByItem)) {
      const qty = Number(qtyStr);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const item = knownItems.get(itemId);
      if (!item) continue;
      if (qty > item.quantityOnHand) {
        overflow++;
        continue;
      }
      lines.push({ itemId, quantity: qty });
    }

    if (lines.length === 0) {
      toast.error("Chưa có dòng nào hợp lệ để chuyển");
      return;
    }
    if (overflow > 0) {
      toast.warning(`${overflow} dòng có số lượng vượt quá tồn kho và sẽ bị bỏ qua.`);
    }

    try {
      setSubmitting(true);
      await createIntraWarehouseTransfer({
        sourceLocationId,
        destinationLocationId: destLocationId,
        lines,
      });
      toast.success(`Đã chuyển ${lines.length} dòng thành công.`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [sourceLocationId, destLocationId, qtyByItem, knownItems, onSaved, onOpenChange]);

  // ─── Reset on close ───────────────────────────────────────────────────────

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setStorageId("");
        setStorageLabel("");
        setSourceLocationId("");
        setSourceLocationLabel("");
        setSourceLocationCode("");
        setDestLocationId("");
        setDestLocationLabel("");
        setServerRows([]);
        setCustomRows([]);
        setQtyByItem({});
        setKnownItems(new Map());
        setPage(1);
        setTotal(0);
        setHasFetched(false);
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Clear both Vị trí selections + grid state when Kho changes
  const resetLocationsAndRows = useCallback(() => {
    setSourceLocationId("");
    setSourceLocationLabel("");
    setSourceLocationCode("");
    setDestLocationId("");
    setDestLocationLabel("");
    setServerRows([]);
    setCustomRows([]);
    setQtyByItem({});
    setKnownItems(new Map());
    setPage(1);
    setTotal(0);
    setHasFetched(false);
  }, []);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const canFetch = Boolean(sourceLocationId);
  const allRows = [...serverRows, ...customRows];
  const validRowCount = Object.entries(qtyByItem).filter(([itemId, qtyStr]) => {
    const qty = Number(qtyStr);
    const item = knownItems.get(itemId);
    return item && qty > 0 && qty <= item.quantityOnHand;
  }).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Chuyển vị trí hàng hoá"
      defaultWidth={1080}
      defaultHeight={680}
    >
      {/* Header form */}
      <div className="border-b">
        <div className="flex flex-wrap items-end gap-4 px-4 py-3">
          {/* Kho — required dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Kho <span className="text-destructive">*</span>
            </span>
            <LookupField<InventoryStorage>
              placeholder="Chọn kho"
              value={storageLabel}
              onValueChange={(v) => {
                setStorageLabel(v);
                if (!v) {
                  setStorageId("");
                  resetLocationsAndRows();
                }
              }}
              onSelect={(s) => {
                setStorageId(s.id);
                setStorageLabel(s.name);
                resetLocationsAndRows();
              }}
              search={searchStorages}
              itemKey={(s) => s.id}
              renderItem={(s) => s.name}
              columns={[
                { key: "name", label: "Tên kho", render: (s) => s.name },
              ]}
              className="w-48"
            />
          </div>

          {/* Vị trí hiện tại — required, filtered by storage */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Vị trí hiện tại <span className="text-destructive">*</span>
            </span>
            <LookupField<InventoryLocation>
              placeholder={storageId ? "Chọn vị trí nguồn" : "Chọn kho trước"}
              value={sourceLocationLabel}
              onValueChange={(v) => {
                setSourceLocationLabel(v);
                setSourceLocationId("");
                setSourceLocationCode("");
                setServerRows([]);
                setCustomRows([]);
                setQtyByItem({});
                setKnownItems(new Map());
                setHasFetched(false);
              }}
              onSelect={(loc) => {
                setSourceLocationId(loc.id);
                setSourceLocationLabel(`${loc.code} · ${loc.name}`);
                setSourceLocationCode(loc.code);
                if (!storageId) {
                  setStorageId(loc.storageId);
                  setStorageLabel(loc.storageName ?? "");
                }
                setServerRows([]);
                setCustomRows([]);
                setQtyByItem({});
                setKnownItems(new Map());
                setHasFetched(false);
              }}
              search={searchLocationsInStorage(storageId)}
              itemKey={(loc) => loc.id}
              renderItem={(loc) => loc.name}
              renderMeta={(loc) => loc.code}
              columns={[
                { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (loc) => loc.code },
                { key: "name", label: "Tên vị trí", render: (loc) => loc.name },
              ]}
              className="w-52"
            />
          </div>

          {/* Vị trí chuyển đến — required, filtered by storage */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Vị trí chuyển đến <span className="text-destructive">*</span>
            </span>
            <LookupField<InventoryLocation>
              placeholder={storageId ? "Chọn vị trí đích" : "Chọn kho trước"}
              value={destLocationLabel}
              onValueChange={(v) => {
                setDestLocationLabel(v);
                setDestLocationId("");
              }}
              onSelect={(loc) => {
                setDestLocationId(loc.id);
                setDestLocationLabel(`${loc.code} · ${loc.name}`);
                if (!storageId) {
                  setStorageId(loc.storageId);
                  setStorageLabel(loc.storageName ?? "");
                }
              }}
              search={searchLocationsInStorage(storageId)}
              itemKey={(loc) => loc.id}
              renderItem={(loc) => loc.name}
              renderMeta={(loc) => loc.code}
              columns={[
                { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (loc) => loc.code },
                { key: "name", label: "Tên vị trí", render: (loc) => loc.name },
              ]}
              className="w-52"
            />
          </div>

          {/* Lấy dữ liệu button */}
          <Button
            variant="secondary"
            size="sm"
            disabled={!canFetch || loadingRows}
            onClick={handleFetchClick}
            className="self-end"
          >
            {loadingRows ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Lấy dữ liệu
          </Button>
        </div>

        {/* Quét mã vạch (visual only) — separate row, right-aligned */}
        <div className="flex justify-end px-4 pb-2">
          <label className="flex cursor-not-allowed items-center gap-1.5 text-sm text-muted-foreground opacity-50">
            <input type="checkbox" disabled />
            Quét mã vạch
          </label>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loadingRows ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang tải dữ liệu…
          </div>
        ) : allRows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {canFetch
              ? hasFetched
                ? 'Vị trí này không có hàng tồn. Bấm "Thêm dòng" để thêm thủ công.'
                : 'Nhấn "Lấy dữ liệu" để tải danh sách hàng tồn.'
              : "Chọn vị trí hiện tại để bắt đầu."}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 text-left backdrop-blur">
              <tr>
                <th className="w-8 border-b px-2 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
                <th className="w-44 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Mã SKU</th>
                <th className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Tên hàng hoá</th>
                <th className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Kho</th>
                <th className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Vị trí hiện tại</th>
                <th className="w-20 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">ĐVT</th>
                <th className="w-28 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">Số lượng tồn</th>
                <th className="w-32 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Số lượng chuyển <span className="text-destructive">*</span>
                </th>
                <th className="w-10 border-b px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {/* Server-fetched rows (current page) */}
              {serverRows.map((row, idx) => {
                const qtyStr = qtyByItem[row.itemId] ?? "";
                const qty = Number(qtyStr);
                const isOverQty = qty > 0 && qty > row.quantityOnHand;
                return (
                  <tr key={row.uid} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="border-b px-2 py-1.5 text-center text-xs text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="border-b px-3 py-1.5 font-mono text-xs">{row.itemCode}</td>
                    <td className="border-b px-3 py-1.5">{row.itemName}</td>
                    <td className="border-b px-3 py-1.5 text-muted-foreground">{row.storageName}</td>
                    <td className="border-b px-3 py-1.5 font-mono text-xs">{row.sourceLocationCode}</td>
                    <td className="border-b px-3 py-1.5 text-right text-muted-foreground">{row.unit}</td>
                    <td className="border-b px-3 py-1.5 text-right tabular-nums">
                      {row.quantityOnHand.toLocaleString("vi-VN")}
                    </td>
                    <td className="border-b px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qtyStr}
                        onChange={(e) => updateQty(row.itemId, e.target.value)}
                        placeholder="0"
                        className={[
                          "w-full rounded border px-2 py-1 text-right text-sm tabular-nums",
                          "bg-background focus:outline-none focus:ring-1 focus:ring-ring",
                          isOverQty ? "border-destructive text-destructive" : "border-input",
                        ].join(" ")}
                      />
                    </td>
                    <td className="border-b px-2 py-1.5 text-center text-muted-foreground" />
                  </tr>
                );
              })}

              {/* Manually added rows */}
              {customRows.map((row, idx) => {
                const displayIdx = serverRows.length + idx + 1;
                const hasItem = Boolean(row.itemId);
                const qtyStr = hasItem ? (qtyByItem[row.itemId] ?? "") : "";
                const qty = Number(qtyStr);
                const isOverQty = hasItem && qty > 0 && qty > row.quantityOnHand;
                return (
                  <tr
                    key={row.uid}
                    className={
                      (serverRows.length + idx) % 2 === 0 ? "bg-primary/5" : "bg-primary/10"
                    }
                  >
                    <td className="border-b px-2 py-1.5 text-center text-xs text-muted-foreground">
                      {displayIdx}
                    </td>
                    <td className="border-b px-2 py-1">
                      <LookupField<ItemSearchResult>
                        placeholder="Tìm mã hoặc tên"
                        value={row.itemCode}
                        onValueChange={(v) => {
                          setCustomRows((prev) =>
                            prev.map((r) =>
                              r.uid === row.uid
                                ? { ...r, itemCode: v, itemId: "", itemName: "", unit: "" }
                                : r,
                            ),
                          );
                        }}
                        onSelect={(item) => void selectItemForCustomRow(row.uid, item)}
                        search={searchItems}
                        itemKey={(item) => item.id}
                        renderItem={(item) => item.name}
                        renderMeta={(item) => item.code}
                        columns={[
                          { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (item) => item.code },
                          { key: "name", label: "Tên hàng hoá", render: (item) => item.name },
                        ]}
                        className="w-full"
                      />
                    </td>
                    <td className="border-b px-3 py-1.5">
                      {row.itemName || <span className="opacity-40">—</span>}
                    </td>
                    <td className="border-b px-3 py-1.5 text-muted-foreground">
                      {row.storageName || <span className="opacity-40">—</span>}
                    </td>
                    <td className="border-b px-3 py-1.5 font-mono text-xs">
                      {row.sourceLocationCode || <span className="opacity-40">—</span>}
                    </td>
                    <td className="border-b px-3 py-1.5 text-right text-muted-foreground">
                      {row.unit || <span className="opacity-40">—</span>}
                    </td>
                    <td className="border-b px-3 py-1.5 text-right tabular-nums">
                      {hasItem ? row.quantityOnHand.toLocaleString("vi-VN") : <span className="opacity-40">—</span>}
                    </td>
                    <td className="border-b px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qtyStr}
                        disabled={!hasItem}
                        onChange={(e) => updateQty(row.itemId, e.target.value)}
                        placeholder="0"
                        className={[
                          "w-full rounded border px-2 py-1 text-right text-sm tabular-nums",
                          "bg-background focus:outline-none focus:ring-1 focus:ring-ring",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          isOverQty ? "border-destructive text-destructive" : "border-input",
                        ].join(" ")}
                      />
                    </td>
                    <td className="border-b px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeCustomRow(row.uid)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Xoá dòng"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination (only for server rows, when total > pageSize) */}
      {total > PAGE_SIZE && (
        <PaginationControls
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={handlePageChange}
          onRefresh={() => void fetchPage(page, sourceLocationCode)}
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addCustomRow}
            disabled={submitting || !sourceLocationId}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
            title={!sourceLocationId ? "Chọn vị trí hiện tại trước" : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm dòng
          </button>
          <span className="text-sm text-muted-foreground">
            Số dòng = {allRows.length}
            {validRowCount > 0 && (
              <span className="ml-2 text-foreground">· Sẽ chuyển {validRowCount} dòng</span>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={submitting || allRows.length === 0}
            onClick={() => void handleSave()}
          >
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Lưu
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => handleOpenChange(false)}
          >
            Hủy bỏ
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
