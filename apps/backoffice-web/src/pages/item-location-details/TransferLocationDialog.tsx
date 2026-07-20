import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  AppModal,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@erp/ui";
import { LookupField } from "../../components/forms/LookupField";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";
import { apiClient } from "../../lib/api-axios";
import { getActiveBranch } from "../../lib/auth-storage";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { useTrailingEmptyRow } from "../../hooks/useTrailingEmptyRow";
import { listStockBalances, type StockBalanceRow } from "../../api/stock-balances";
import {
  createIntraWarehouseTransfer,
  type IntraWarehouseTransferLine,
} from "../../api/stock-transfers";

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
  // Item
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  // Warehouse (display only — always the header storage)
  storageName: string;
  // Source location (editable per row, defaults to header source)
  sourceLocationId: string;
  sourceLocationLabel: string;
  sourceLocationCode: string;
  // Destination location (editable per row, defaults to header dest)
  destLocationId: string;
  destLocationLabel: string;
  // On-hand at this row's source location for this row's item
  quantityOnHand: number;
  // Entered transfer quantity (string for controlled input)
  qty: string;
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
  selectedRows?: StockBalanceRow[];
}

const FETCH_PAGE_SIZE = 100;

type RowValidationReason =
  | "missingLocation"
  | "sameLocation"
  | "invalidQuantity"
  | "exceedsStock";

function getRowValidationReason(
  row: TransferRow,
): RowValidationReason | null {
  if (!row.sourceLocationId || !row.destLocationId) return "missingLocation";
  if (row.sourceLocationId === row.destLocationId) return "sameLocation";

  // Cho phép chuyển 0 (đổi vị trí kể cả khi hết tồn); chỉ chặn số âm/không hợp lệ.
  const qty = Number(row.qty);
  if (!Number.isFinite(qty) || qty < 0) return "invalidQuantity";
  if (qty > row.quantityOnHand) return "exceedsStock";
  return null;
}

const VALIDATION_LABELS: Record<RowValidationReason, string> = {
  missingLocation: "chưa chọn đủ vị trí nguồn/đích",
  sameLocation: "vị trí nguồn trùng vị trí đích",
  invalidQuantity: "chưa nhập số lượng chuyển hợp lệ",
  exceedsStock: "số lượng chuyển vượt quá tồn kho",
};

// Stable sentinel fed to useTrailingEmptyRow before a Kho is chosen: length 1
// (so it isn't auto-seeded) and "empty" (so nothing is appended). Never rendered.
const NO_STORAGE_SENTINEL: TransferRow[] = [
  {
    uid: "__sentinel__",
    itemId: "",
    itemCode: "",
    itemName: "",
    unit: "",
    storageName: "",
    sourceLocationId: "",
    sourceLocationLabel: "",
    sourceLocationCode: "",
    destLocationId: "",
    destLocationLabel: "",
    quantityOnHand: 0,
    qty: "",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function TransferLocationDialog({
  open,
  onOpenChange,
  onSaved,
  selectedRows = [],
}: Props): ReactElement {
  // Header — Kho (storage)
  const [storageId, setStorageId] = useState("");
  const [storageLabel, setStorageLabel] = useState("");

  // Header — Vị trí hiện tại (default source)
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [sourceLocationLabel, setSourceLocationLabel] = useState("");
  const [sourceLocationCode, setSourceLocationCode] = useState("");

  // Header — Vị trí chuyển đến (default destination)
  const [destLocationId, setDestLocationId] = useState("");
  const [destLocationLabel, setDestLocationLabel] = useState("");

  // Grid rows (all editable per row)
  const [rows, setRows] = useState<TransferRow[]>([]);

  // Status
  const [loadingRows, setLoadingRows] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [productPickerRowId, setProductPickerRowId] = useState<string | null>(
    null,
  );

  // ─── Lookup search functions ─────────────────────────────────────────────

  const searchStorages = useCallback(async (query: string, page: number, pageSize?: number) => {
    const effectivePageSize = pageSize ?? 50;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(effectivePageSize),
    });
    const branchId = getActiveBranch();
    if (query.trim()) params.set("search", query.trim());
    if (branchId) params.set("branchId", branchId);
    params.set("activeOnly", "true");
    const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
      `/inventory/storages?${params}`,
    );
    const fetched = data.page * data.pageSize;
    return {
      items: data.data,
      hasMore: fetched < data.total,
      total: data.total,
    };
  }, []);

  const searchLocationsInStorage = useCallback(
    (sid: string) => async (query: string, page: number, pageSize?: number) => {
      if (!sid) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 50;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        storageId: sid,
        activeOnly: "true",
      });
      const branchId = getActiveBranch();
      if (query.trim()) params.set("search", query.trim());
      if (branchId) params.set("branchId", branchId);
      const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
    },
    [],
  );

  useEffect(() => {
    if (!open || selectedRows.length === 0) return;
    const first = selectedRows[0];
    if (!first) return;
    setStorageId(first.location.storageId);
    setStorageLabel(first.location.storageName);
    setSourceLocationId(first.location.id);
    setSourceLocationLabel(`${first.location.code} · ${first.location.name}`);
    setSourceLocationCode(first.location.code);
    setDestLocationId("");
    setDestLocationLabel("");
    setRows(
      selectedRows.map((r) => {
        const quantityOnHand = Number(r.quantity);
        return {
          uid: crypto.randomUUID(),
          itemId: r.itemId,
          itemCode: r.item.code,
          itemName: r.item.name,
          unit: r.item.unit,
          storageName: r.location.storageName,
          sourceLocationId: r.location.id,
          sourceLocationLabel: `${r.location.code} · ${r.location.name}`,
          sourceLocationCode: r.location.code,
          destLocationId: "",
          destLocationLabel: "",
          quantityOnHand,
          qty: String(quantityOnHand),
        };
      }),
    );
  }, [open, selectedRows]);

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<ItemSearchResult>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  // ─── Row helpers ──────────────────────────────────────────────────────────

  const patchRow = useCallback((uid: string, patch: Partial<TransferRow>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }, []);

  // Fetch on-hand at a given source location for a given item (0 when no stock).
  const fetchOnHand = useCallback(
    async (itemId: string, locationCode: string): Promise<number> => {
      const result = await listStockBalances({
        page: 1,
        pageSize: 1,
        itemId,
        locationCode,
        locationCodeMode: "equals",
      });
      const bal = (result.data as StockBalanceRow[])[0];
      return bal ? Number(bal.quantity) : 0;
    },
    [],
  );

  const refreshRowOnHand = useCallback(
    async (uid: string, itemId: string, locationCode: string) => {
      if (!itemId || !locationCode) return;
      try {
        const onHand = await fetchOnHand(itemId, locationCode);
        patchRow(uid, {
          quantityOnHand: onHand,
          qty: String(onHand),
        });
        if (onHand <= 0) {
          toast.error(`Hàng này không có tồn ở vị trí ${locationCode}`);
        }
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [fetchOnHand, patchRow],
  );

  // ─── Lấy dữ liệu — load all on-hand items at the header source ────────────

  const handleFetchClick = useCallback(async () => {
    if (!sourceLocationId || !sourceLocationCode) {
      toast.error("Vui lòng chọn vị trí hiện tại trước");
      return;
    }
    setLoadingRows(true);
    try {
      // Load every item with on-hand at the source location across pages.
      const collected: StockBalanceRow[] = [];
      let pageNum = 1;
      let total = Infinity;
      while (collected.length < total) {
        const result = await listStockBalances({
          page: pageNum,
          pageSize: FETCH_PAGE_SIZE,
          locationCode: sourceLocationCode,
          locationCodeMode: "equals",
          quantity: 0,
          quantityOp: "gt",
        });
        total = result.total;
        const batch = result.data as StockBalanceRow[];
        collected.push(...batch);
        if (batch.length === 0) break;
        pageNum += 1;
      }

      const mapped = collected.map<TransferRow>((r) => ({
        uid: crypto.randomUUID(),
        itemId: r.itemId,
        itemCode: r.item.code,
        itemName: r.item.name,
        unit: r.item.unit,
        storageName: r.location.storageName,
        sourceLocationId,
        sourceLocationLabel: sourceLocationLabel,
        sourceLocationCode: r.location.code,
        destLocationId,
        destLocationLabel,
        quantityOnHand: Number(r.quantity),
        qty: String(Number(r.quantity)),
      }));
      setRows(mapped);
      if (mapped.length === 0) {
        toast.info("Vị trí này không có hàng tồn kho nào.");
      }
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setLoadingRows(false);
    }
  }, [
    sourceLocationId,
    sourceLocationCode,
    sourceLocationLabel,
    destLocationId,
    destLocationLabel,
  ]);

  // ─── Manual row add ───────────────────────────────────────────────────────

  // Blank-row factory — defaults source/destination to the current header.
  const makeEmptyRow = useCallback(
    (): TransferRow => ({
      uid: crypto.randomUUID(),
      itemId: "",
      itemCode: "",
      itemName: "",
      unit: "",
      storageName: storageLabel,
      // Source defaults to the header "Vị trí hiện tại".
      sourceLocationId,
      sourceLocationLabel,
      sourceLocationCode,
      // Destination defaults to the header "Vị trí chuyển đến".
      destLocationId,
      destLocationLabel,
      quantityOnHand: 0,
      qty: "",
    }),
    [
      storageLabel,
      sourceLocationId,
      sourceLocationLabel,
      sourceLocationCode,
      destLocationId,
      destLocationLabel,
    ],
  );

  const addRow = useCallback(() => {
    if (!storageId) {
      toast.error("Chọn kho trước khi thêm hàng hoá");
      return;
    }
    setRows((prev) => [...prev, makeEmptyRow()]);
  }, [storageId, makeEmptyRow]);

  // Keep exactly one blank trailing row once a Kho is chosen (unified grid
  // rule). The same `rows` array holds both server-loaded rows ("Lấy dữ liệu")
  // and manual entries, so the trailing empty applies to whichever the user
  // types into. Before a storage is chosen we feed the hook a sentinel row it
  // reads as "already ends empty" (no append), keeping the initial empty-state
  // ("Chọn kho…") and the "Lấy dữ liệu" prompt reachable.
  useTrailingEmptyRow(storageId ? rows : NO_STORAGE_SENTINEL, setRows, {
    isEmpty: (row) => !row.itemId,
    makeEmpty: makeEmptyRow,
  });

  const removeRow = useCallback((uid: string) => {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  }, []);

  const copyDestToRowsBelow = useCallback((uid: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.uid === uid);
      if (idx === -1) return prev;
      const src = prev[idx]!;
      if (!src.destLocationId) {
        toast.error("Chọn vị trí chuyển đến cho dòng này trước");
        return prev;
      }
      return prev.map((r, i) => {
        if (i <= idx) return r;
        if (!r.itemId) return r; // Skip empty/unselected rows
        if (r.sourceLocationId === src.destLocationId) return r; // Destination cannot equal source
        return {
          ...r,
          destLocationId: src.destLocationId,
          destLocationLabel: src.destLocationLabel,
        };
      });
    });
  }, []);

  // ─── Row field handlers ───────────────────────────────────────────────────

  const selectItemForRow = useCallback(
    (row: TransferRow, item: ItemSearchResult) => {
      // Reject duplicates already in another row at the same source.
      const dup = rows.some(
        (r) =>
          r.uid !== row.uid &&
          r.itemId === item.id &&
          r.sourceLocationId === row.sourceLocationId,
      );
      if (dup) {
        toast.warning(`SKU ${item.code} đã có trong bảng`);
        return;
      }
      patchRow(row.uid, {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        quantityOnHand: 0,
      });
      if (row.sourceLocationCode) {
        void refreshRowOnHand(row.uid, item.id, row.sourceLocationCode);
      }
    },
    [rows, patchRow, refreshRowOnHand],
  );

  // Select by product: expand ALL variants of the chosen product into multiple rows,
  // inheriting the source/dest location of the origin row and defaulting qty to on-hand at source.
  const applyProductSelection = useCallback(
    async (result: ProductSelectResult) => {
      if (!productPickerRowId || result.lines.length === 0) return;
      const target = rows.find((r) => r.uid === productPickerRowId);
      if (!target) return;

      // Skip variants already present at the same source location to avoid duplicate rows.
      const existingKeys = new Set(
        rows
          .filter((r) => r.uid !== productPickerRowId && r.itemId)
          .map((r) => `${r.itemId}@${r.sourceLocationId}`),
      );
      const uniqueLines = result.lines.filter(
        (line) => !existingKeys.has(`${line.itemId}@${target.sourceLocationId}`),
      );
      if (uniqueLines.length === 0) {
        toast.warning("Các hàng hoá này đã có trong bảng");
        setProductPickerRowId(null);
        return;
      }

      // Fetch on-hand per variant at the source location (in parallel) to set the default qty.
      let onHandByItem = new Map<string, number>();
      if (target.sourceLocationCode) {
        try {
          const balances = await Promise.all(
            uniqueLines.map(async (line) => ({
              itemId: line.itemId,
              onHand: await fetchOnHand(line.itemId, target.sourceLocationCode),
            })),
          );
          onHandByItem = new Map(balances.map((b) => [b.itemId, b.onHand]));
        } catch (err) {
          toast.error(getUserFacingApiErrorMessage(err));
        }
      }

      const newRows = uniqueLines.map<TransferRow>((line) => {
        const onHand = onHandByItem.get(line.itemId) ?? 0;
        return {
          uid: crypto.randomUUID(),
          itemId: line.itemId,
          itemCode: line.sku,
          itemName: line.name,
          unit: line.unit,
          storageName: target.storageName,
          sourceLocationId: target.sourceLocationId,
          sourceLocationLabel: target.sourceLocationLabel,
          sourceLocationCode: target.sourceLocationCode,
          destLocationId: target.destLocationId,
          destLocationLabel: target.destLocationLabel,
          quantityOnHand: onHand,
          qty: String(onHand),
        };
      });

      // Replace the origin row with the expanded variant rows (keep its position in the table).
      setRows((prev) => {
        const index = prev.findIndex((r) => r.uid === productPickerRowId);
        if (index < 0) return prev;
        return [...prev.slice(0, index), ...newRows, ...prev.slice(index + 1)];
      });
      setProductPickerRowId(null);
    },
    [productPickerRowId, rows, fetchOnHand],
  );

  const selectSourceForRow = useCallback(
    (row: TransferRow, loc: InventoryLocation) => {
      patchRow(row.uid, {
        sourceLocationId: loc.id,
        sourceLocationLabel: `${loc.code} · ${loc.name}`,
        sourceLocationCode: loc.code,
        storageName: loc.storageName ?? row.storageName,
        quantityOnHand: 0,
      });
      if (row.itemId) {
        void refreshRowOnHand(row.uid, row.itemId, loc.code);
      }
    },
    [patchRow, refreshRowOnHand],
  );

  const selectDestForRow = useCallback(
    (row: TransferRow, loc: InventoryLocation) => {
      if (loc.id === row.sourceLocationId) {
        toast.error("Vị trí chuyển đến phải khác vị trí hiện tại");
        return;
      }
      patchRow(row.uid, {
        destLocationId: loc.id,
        destLocationLabel: `${loc.code} · ${loc.name}`,
      });
    },
    [patchRow],
  );

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const lines: IntraWarehouseTransferLine[] = [];
    const invalidByReason = new Map<RowValidationReason, number>();
    for (const row of rows) {
      // Skip untouched trailing/blank rows entirely — they aren't "invalid".
      if (!row.itemId) {
        continue;
      }
      const invalidReason = getRowValidationReason(row);
      if (invalidReason) {
        invalidByReason.set(
          invalidReason,
          (invalidByReason.get(invalidReason) ?? 0) + 1,
        );
        continue;
      }
      lines.push({
        itemId: row.itemId,
        quantity: Number(row.qty),
        sourceLocationId: row.sourceLocationId,
        destinationLocationId: row.destLocationId,
      });
    }

    const invalidSummary = [...invalidByReason]
      .map(([reason, count]) => `${count} dòng ${VALIDATION_LABELS[reason]}`)
      .join("; ");

    if (lines.length === 0) {
      toast.error(
        invalidSummary
          ? `Không thể chuyển: ${invalidSummary}.`
          : "Chưa có hàng hóa nào để chuyển.",
      );
      return;
    }
    if (invalidByReason.size > 0) {
      toast.warning(`${invalidSummary}; các dòng này sẽ bị bỏ qua.`);
    }

    try {
      setSubmitting(true);
      await createIntraWarehouseTransfer({ lines });
      toast.success(`Đã chuyển ${lines.length} dòng.`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [rows, onSaved, onOpenChange]);

  // ─── Reset on close ─────────────────────────────────────────────────────────

  const resetAll = useCallback(() => {
    setStorageId("");
    setStorageLabel("");
    setSourceLocationId("");
    setSourceLocationLabel("");
    setSourceLocationCode("");
    setDestLocationId("");
    setDestLocationLabel("");
    setRows([]);
    setProductPickerRowId(null);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) resetAll();
      onOpenChange(nextOpen);
    },
    [onOpenChange, resetAll],
  );

  // Changing Kho clears the locations + grid (they belong to the old storage).
  const resetLocationsAndRows = useCallback(() => {
    setSourceLocationId("");
    setSourceLocationLabel("");
    setSourceLocationCode("");
    setDestLocationId("");
    setDestLocationLabel("");
    setRows([]);
  }, []);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const canFetch = Boolean(sourceLocationId);

  const validRowCount = rows.filter(
    (row) => row.itemId && getRowValidationReason(row) === null,
  ).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Chuyển vị trí hàng hóa"
      defaultWidth={1000}
      defaultHeight={600}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      showFooter={false}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-end gap-4 border-b px-4 py-2">
        {/* Kho */}
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
            columns={[{ key: "name", label: "Tên kho", render: (s) => s.name }]}
            className="w-44"
          />
        </div>

        {/* Vị trí hiện tại (default source) */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Vị trí hiện tại <span className="text-destructive">*</span>
          </span>
          <LookupField<InventoryLocation>
            placeholder={storageId ? "Chọn vị trí nguồn" : "Chọn kho trước"}
            value={sourceLocationLabel}
            disabled={!storageId}
            onValueChange={(v) => {
              setSourceLocationLabel(v);
              setSourceLocationId("");
              setSourceLocationCode("");
            }}
            onSelect={(loc) => {
              setSourceLocationId(loc.id);
              setSourceLocationLabel(`${loc.code} · ${loc.name}`);
              setSourceLocationCode(loc.code);
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

        {/* Vị trí chuyển đến (default destination) */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Vị trí chuyển đến</span>
          <LookupField<InventoryLocation>
            placeholder={storageId ? "Chọn vị trí đích" : "Chọn kho trước"}
            value={destLocationLabel}
            disabled={!storageId}
            onValueChange={(v) => {
              setDestLocationLabel(v);
              setDestLocationId("");
            }}
            onSelect={(loc) => {
              if (loc.id === sourceLocationId) {
                toast.error("Vị trí chuyển đến phải khác vị trí hiện tại");
                return;
              }
              setDestLocationId(loc.id);
              setDestLocationLabel(`${loc.code} · ${loc.name}`);
              setRows((prev) =>
                prev.map((row) =>
                  row.itemId && row.sourceLocationId !== loc.id
                    ? {
                        ...row,
                        destLocationId: loc.id,
                        destLocationLabel: `${loc.code} · ${loc.name}`,
                      }
                    : row,
                ),
              );
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

        {/* Lấy dữ liệu */}
        <Button
          variant="secondary"
          size="sm"
          disabled={!canFetch || loadingRows}
          onClick={() => void handleFetchClick()}
          className="self-end"
        >
          {loadingRows ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 h-3.5 w-3.5" />
          )}
          Lấy dữ liệu
        </Button>

        {/* Quét mã vạch (visual only) */}
        <label className="ml-auto flex cursor-not-allowed items-center gap-1.5 self-end pb-2 text-sm text-muted-foreground opacity-50">
          <input type="checkbox" disabled />
          Quét mã vạch
        </label>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loadingRows ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang tải dữ liệu…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {canFetch
              ? 'Nhấn "Lấy dữ liệu" để tải danh sách hàng tồn, hoặc "Thêm dòng" để thêm thủ công.'
              : "Chọn kho và vị trí hiện tại để bắt đầu."}
          </div>
        ) : (
          <table className="w-full min-w-[1360px] table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left [&_th]:bg-muted">
              <tr>
                <th className="w-8 border-b px-2 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
                <th className="w-68 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Mã SKU</th>
                <th className="w-48 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Tên hàng hóa</th>
                <th className="w-40 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Kho</th>
                <th className="w-48 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Vị trí hiện tại <span className="text-destructive">*</span>
                </th>
                <th className="w-20 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Đơn vị tính
                </th>
                <th className="w-24 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Số lượng tồn
                </th>
                <th className="w-48 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Vị trí chuyển đến <span className="text-destructive">*</span>
                </th>
                <th className="w-28 border-b px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Số lượng chuyển <span className="text-destructive">*</span>
                </th>
                <th className="w-20 border-b px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const qty = Number(row.qty);
                const hasItem = Boolean(row.itemId);
                const hasSource = Boolean(row.sourceLocationId);
                const isOverQty = qty > 0 && qty > row.quantityOnHand;
                return (
                  <tr key={row.uid} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="border-b px-2 py-2 text-center text-xs text-muted-foreground">
                      {idx + 1}
                    </td>
                    {/* Mã SKU */}
                    <td className="border-b px-2 py-2">
                      <LookupField<ItemSearchResult>
                        placeholder="Tìm mã hoặc tên"
                        value={row.itemCode}
                        onValueChange={(v) =>
                          patchRow(row.uid, {
                            itemCode: v,
                            itemId: "",
                            itemName: "",
                            unit: "",
                            quantityOnHand: 0,
                          })
                        }
                        onSelect={(item) => selectItemForRow(row, item)}
                        search={searchItems}
                        itemKey={(item) => item.id}
                        renderItem={(item) => item.name}
                        renderMeta={(item) => item.code}
                        columns={[
                          { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (item) => item.code },
                          { key: "name", label: "Tên hàng hóa", render: (item) => item.name },
                        ]}
                        onSearchButtonClick={() => setProductPickerRowId(row.uid)}
                        className="w-full"
                      />
                    </td>
                    {/* Tên hàng hóa */}
                    <td className="border-b px-3 py-2">
                      {row.itemName || <span className="opacity-40">—</span>}
                    </td>
                    {/* Kho */}
                    <td className="border-b px-3 py-2 text-muted-foreground">
                      {row.storageName || <span className="opacity-40">—</span>}
                    </td>
                    {/* Vị trí hiện tại (source) */}
                    <td className="border-b px-2 py-2">
                      <LookupField<InventoryLocation>
                        placeholder="Chọn vị trí nguồn"
                        value={row.sourceLocationLabel}
                        disabled={!storageId}
                        onValueChange={(v) =>
                          patchRow(row.uid, {
                            sourceLocationLabel: v,
                            sourceLocationId: "",
                            sourceLocationCode: "",
                            quantityOnHand: 0,
                          })
                        }
                        onSelect={(loc) => selectSourceForRow(row, loc)}
                        search={searchLocationsInStorage(storageId)}
                        itemKey={(loc) => loc.id}
                        renderItem={(loc) => loc.name}
                        renderMeta={(loc) => loc.code}
                        columns={[
                          { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (loc) => loc.code },
                          { key: "name", label: "Tên vị trí", render: (loc) => loc.name },
                        ]}
                        className="w-full"
                      />
                    </td>
                    {/* Đơn vị tính */}
                    <td className="border-b px-3 py-2 text-right text-muted-foreground">
                      {row.unit || <span className="opacity-40">—</span>}
                    </td>
                    {/* Số lượng tồn */}
                    <td className="border-b px-3 py-2 text-right tabular-nums">
                      {hasItem && hasSource ? (
                        row.quantityOnHand.toLocaleString("vi-VN")
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </td>
                    {/* Vị trí chuyển đến (dest) */}
                    <td className="border-b px-2 py-2">
                      <LookupField<InventoryLocation>
                        placeholder={storageId ? "Chọn vị trí đích" : "Chọn kho trước"}
                        value={row.destLocationLabel}
                        disabled={!storageId}
                        onValueChange={(v) =>
                          patchRow(row.uid, {
                            destLocationLabel: v,
                            destLocationId: "",
                          })
                        }
                        onSelect={(loc) => selectDestForRow(row, loc)}
                        search={searchLocationsInStorage(storageId)}
                        itemKey={(loc) => loc.id}
                        renderItem={(loc) => loc.name}
                        renderMeta={(loc) => loc.code}
                        columns={[
                          { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (loc) => loc.code },
                          { key: "name", label: "Tên vị trí", render: (loc) => loc.name },
                        ]}
                        className="w-full"
                      />
                    </td>
                    {/* Số lượng chuyển */}
                    <td className="border-b px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={row.qty}
                        disabled={!hasItem || !hasSource}
                        onChange={(e) => patchRow(row.uid, { qty: e.target.value })}
                        placeholder="0"
                        className={[
                          "w-full rounded border px-2 py-1 text-right text-sm tabular-nums",
                          "bg-background focus:outline-none focus:ring-1 focus:ring-ring",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          isOverQty ? "border-destructive text-destructive" : "border-input",
                        ].join(" ")}
                      />
                    </td>
                    {/* Actions */}
                    <td className="border-b px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => copyDestToRowsBelow(row.uid)}
                                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                                aria-label="Sao chép vị trí chuyển đến cho các dòng dưới"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Sao chép vị trí chuyển đến cho các dòng dưới
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <button
                          type="button"
                          onClick={() => removeRow(row.uid)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Xoá dòng"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addRow}
            disabled={submitting || !storageId}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-primary-blue transition-colors hover:bg-primary-blue/10 hover:text-primary-blue-hover disabled:pointer-events-none disabled:opacity-50"
            title={!storageId ? "Chọn kho trước" : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm dòng
          </button>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-sm text-primary-blue hover:underline"
          >
            Trợ giúp
          </a>
          <span className="text-sm text-muted-foreground">
            Số dòng = {rows.length}
            {validRowCount > 0 && (
              <span className="ml-2 text-foreground">· Sẽ chuyển {validRowCount} dòng</span>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
            disabled={submitting || rows.length === 0}
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

      {productPickerRowId ? (
        <ProductSelectDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setProductPickerRowId(null);
          }}
          title="Chọn hàng hóa"
          resolveSelectedLines
          initialSelectedIds={
            new Set(
              [rows.find((row) => row.uid === productPickerRowId)?.itemId].filter(
                (id): id is string => Boolean(id),
              ),
            )
          }
          onConfirm={(result) => void applyProductSelection(result)}
        />
      ) : null}
    </AppModal>
  );
}
