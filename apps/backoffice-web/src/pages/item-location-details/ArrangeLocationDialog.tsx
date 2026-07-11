import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { HelpCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { AppModal, Button } from "@erp/ui";
import { LookupField } from "../../components/forms/LookupField";
import { apiClient } from "../../lib/api-axios";
import { getActiveBranch } from "../../lib/auth-storage";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  assignArrange,
  type ArrangeLine,
  type StockBalanceRow,
} from "../../api/stock-balances";
import { getPreferredShelfBatch } from "../../api/inventory-location-preferences";
import { useTrailingEmptyRow } from "../../hooks/useTrailingEmptyRow";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductVariantSearchResult {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  storageName?: string;
}

interface InventoryStorage {
  id: string;
  name: string;
  isMainStorage?: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

type ArrangeRow = {
  uid: string;
  groupId: string | null;
  groupType: "product" | "orphan" | null;
  itemIds: string[];
  itemCode: string;
  itemName: string;
  unit: string;
  storageId: string | null;
  storageName: string;
  locationId: string | null;
  locationCode: string;
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Hàng đã chọn ở bảng — điền sẵn vào dialog (giống Chuyển vị trí). */
  selectedRows?: StockBalanceRow[];
  initialLocation?: {
    id: string;
    code: string;
    name: string;
    storageId: string;
    storageName?: string;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyRow(): ArrangeRow {
  return {
    uid: crypto.randomUUID(),
    groupId: null,
    groupType: null,
    itemIds: [],
    itemCode: "",
    itemName: "",
    unit: "",
    storageId: null,
    storageName: "",
    locationId: null,
    locationCode: "",
  };
}

function isRowComplete(row: ArrangeRow): boolean {
  return Boolean(row.itemIds.length > 0 && row.storageId && row.locationId);
}

// A row is "empty" (not yet started) until a product group is selected.
function isRowEmpty(row: ArrangeRow): boolean {
  return row.itemIds.length === 0;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ArrangeLocationDialog({
  open,
  onOpenChange,
  onSaved,
  selectedRows = [],
  initialLocation = null,
}: Props): ReactElement {
  const [rows, setRows] = useState<ArrangeRow[]>(() => [emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [productPickerRowId, setProductPickerRowId] = useState<string | null>(
    null,
  );
  // Reset when closed
  useEffect(() => {
    if (!open) {
      setRows([emptyRow()]);
      setProductPickerRowId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialLocation || selectedRows.length > 0) return;
    setRows([
      {
        ...emptyRow(),
        storageId: initialLocation.storageId,
        storageName: initialLocation.storageName ?? "",
        locationId: initialLocation.id,
        locationCode: `${initialLocation.code} · ${initialLocation.name}`,
      },
    ]);
  }, [open, initialLocation, selectedRows.length]);

  // Auto fill selected rows from the table into the dialog.
  useEffect(() => {
    if (!open || selectedRows.length === 0) return;
    setRows(
      selectedRows.map<ArrangeRow>((r) => ({
        uid: crypto.randomUUID(),
        groupId: r.itemId,
        groupType: "orphan",
        itemIds: [r.itemId],
        itemCode: r.item.code,
        itemName: r.item.name,
        unit: r.item.unit,
        storageId: r.location.storageId,
        storageName: r.location.storageName,
        locationId: null,
        locationCode: "",
      })),
    );
  }, [open, selectedRows]);

  // Always keep exactly one blank trailing row (unified grid rule).
  useTrailingEmptyRow(rows, setRows, {
    isEmpty: isRowEmpty,
    makeEmpty: emptyRow,
  });

  // ─── Search functions ─────────────────────────────────────────────────────

  const searchItems = useCallback(
    async (query: string, page: number, pageSize = 20) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data: res } = await apiClient.get<
        PaginatedResponse<ProductVariantSearchResult>
      >(`/inventory/items?${params}`);
      return {
        items: res.data,
        hasMore: page * pageSize < res.total,
        total: res.total,
      };
    },
    [],
  );

  const searchStorages = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    const branchId = getActiveBranch();
    if (query.trim()) params.set("search", query.trim());
    if (branchId) params.set("branchId", branchId);
    params.set("activeOnly", "true");
    const { data: res } = await apiClient.get<
      PaginatedResponse<InventoryStorage>
    >(`/inventory/storages?${params}`);
    return res.data;
  }, []);

  const searchLocationsFor = useCallback(
    (storageId: string | null) => async (query: string) => {
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      const branchId = getActiveBranch();
      if (query.trim()) params.set("search", query.trim());
      if (storageId) params.set("storageId", storageId);
      if (branchId) params.set("branchId", branchId);
      params.set("activeOnly", "true");
      const { data: res } = await apiClient.get<
        PaginatedResponse<InventoryLocation>
      >(`/inventory/locations?${params}`);
      return res.data;
    },
    [],
  );

  // ─── Row mutations ────────────────────────────────────────────────────────

  const updateRow = useCallback((uid: string, patch: Partial<ArrangeRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    );
  }, []);

  const removeRow = useCallback((uid: string) => {
    setRows((prev) => {
      if (prev.length === 1) {
        return [emptyRow()];
      }
      return prev.filter((r) => r.uid !== uid);
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const applyProductSelection = useCallback(
    async (result: ProductSelectResult) => {
      if (!productPickerRowId || result.lines.length === 0) return;
      const target = rows.find((row) => row.uid === productPickerRowId);
      if (!target) return;

      let shelfByItem = new Map<
        string,
        { id: string; code: string; name: string } | null
      >();
      if (target.storageId && !target.locationId) {
        try {
          const shelves = await getPreferredShelfBatch(
            result.lines.map((line) => ({
              itemId: line.itemId,
              storageId: target.storageId as string,
            })),
          );
          shelfByItem = new Map(
            shelves.map((entry) => [entry.itemId, entry.shelf]),
          );
        } catch (err) {
          toast.error(getUserFacingApiErrorMessage(err));
        }
      }

      const selectedRows = result.lines.map<ArrangeRow>((line) => {
        const shelf = shelfByItem.get(line.itemId);
        return {
          uid: crypto.randomUUID(),
          groupId: line.itemId,
          groupType: "orphan",
          itemIds: [line.itemId],
          itemCode: line.sku,
          itemName: line.name,
          unit: line.unit,
          storageId: target.storageId,
          storageName: target.storageName,
          locationId: target.locationId ?? shelf?.id ?? null,
          locationCode:
            target.locationCode ||
            (shelf ? `${shelf.code} · ${shelf.name}` : ""),
        };
      });

      setRows((prev) => {
        const index = prev.findIndex((row) => row.uid === productPickerRowId);
        if (index < 0) return prev;
        return [
          ...prev.slice(0, index),
          ...selectedRows,
          ...prev.slice(index + 1),
        ];
      });
      setProductPickerRowId(null);
    },
    [productPickerRowId, rows],
  );

  const resolveGroupItemIds = useCallback(async (row: ArrangeRow) => {
    if (!row.groupId || row.groupType !== "product") {
      return row.itemIds;
    }
    const pageSize = 100;
    const itemIds: string[] = [];
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const { data } = await apiClient.get<
        PaginatedResponse<ProductVariantSearchResult>
      >(`/inventory/items/products/${row.groupId}/items?${params}`);
      itemIds.push(...data.data.map((item) => item.id));

      if (itemIds.length >= data.total || data.data.length < pageSize) {
        return itemIds;
      }
      page += 1;
    }
  }, []);

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    try {
      setSubmitting(true);
      const resolvedRows = await Promise.all(
        rows.filter(isRowComplete).map(async (row) => ({
          row,
          itemIds: await resolveGroupItemIds(row),
        })),
      );
      const lines: ArrangeLine[] = resolvedRows.flatMap(({ row, itemIds }) =>
        itemIds.map((itemId) => ({
          itemId,
          storageId: row.storageId as string,
          destinationLocationId: row.locationId as string,
        })),
      );

      if (lines.length === 0) {
        toast.error("Chưa có hàng hóa hợp lệ để xếp");
        return;
      }

      await assignArrange(lines);
      toast.success(`Đã xếp ${lines.length} hàng hóa lên vị trí.`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [rows, resolveGroupItemIds, onSaved, onOpenChange]);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const validRowCount = rows.filter(isRowComplete).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Xếp vị trí hàng hóa"
      defaultWidth={1000}
      defaultHeight={600}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      showFooter={false}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-end gap-4 border-b px-4 py-3">
        {/* Quét mã vạch (visual only, disabled) */}
        <label className="flex cursor-not-allowed items-center gap-1.5 text-sm text-muted-foreground opacity-50">
          <input type="checkbox" disabled />
          Quét mã vạch
        </label>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left [&_th]:bg-muted">
            <tr>
              <th className="w-8 border-b px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                #
              </th>
              <th className="w-48 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Mã SKU
              </th>
              <th className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Hàng hóa
              </th>
              <th className="w-60 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Kho
              </th>
              <th className="w-20 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Đơn vị tính
              </th>
              <th className="w-52 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                Vị trí
              </th>
              <th className="w-10 border-b px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.uid}
                className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                <td className="border-b px-2 py-2 text-center text-xs text-muted-foreground">
                  {idx + 1}
                </td>

                {/* Mã SKU — LookupField: mọi biến thể, lazy-load + search backend */}
                <td className="border-b px-2 py-2">
                  <LookupField<ProductVariantSearchResult>
                    placeholder="Tìm mã hoặc tên"
                    value={row.itemCode}
                    onValueChange={(v) =>
                      updateRow(row.uid, {
                        itemCode: v,
                        groupId: null,
                        groupType: null,
                        itemIds: [],
                        itemName: "",
                        unit: "",
                      })
                    }
                    onSelect={(item) =>
                      updateRow(row.uid, {
                        groupId: item.id,
                        groupType: "orphan",
                        itemIds: [item.id],
                        itemCode: item.code,
                        itemName: item.name,
                        unit: item.unit,
                      })
                    }
                    search={searchItems}
                    itemKey={(item) => item.id}
                    renderItem={(item) => item.name}
                    renderMeta={(item) => item.code}
                    columns={[
                      {
                        key: "code",
                        label: "Mã SKU",
                        className: "w-[130px] font-mono text-xs",
                        render: (item) => item.code,
                      },
                      {
                        key: "name",
                        label: "Tên hàng hóa",
                        render: (item) => item.name,
                      },
                    ]}
                    onSearchButtonClick={() => setProductPickerRowId(row.uid)}
                    className="w-full"
                  />
                </td>

                {/* Tên hàng hóa — readonly */}
                <td className="border-b px-3 py-2 text-muted-foreground">
                  {row.itemName || <span className="opacity-40">—</span>}
                </td>

                {/* Kho — LookupField */}
                <td className="border-b px-2 py-2">
                  <LookupField<InventoryStorage>
                    placeholder="Chọn kho"
                    value={row.storageName}
                    onValueChange={(v) =>
                      updateRow(row.uid, {
                        storageName: v,
                        storageId: null,
                      })
                    }
                    onSelect={(s) =>
                      updateRow(row.uid, {
                        storageId: s.id,
                        storageName: s.name,
                        // Reset Vị trí because the previous location may belong
                        // to a different storage.
                        locationId: null,
                        locationCode: "",
                      })
                    }
                    search={searchStorages}
                    itemKey={(s) => s.id}
                    renderItem={(s) => s.name}
                    columns={[
                      { key: "name", label: "Tên kho", render: (s) => s.name },
                    ]}
                    className="w-full"
                  />
                </td>

                {/* Đơn vị tính — readonly */}
                <td className="border-b px-3 py-2 text-muted-foreground">
                  {row.unit || <span className="opacity-40">—</span>}
                </td>

                {/* Vị trí — LookupField, filtered by storage */}
                <td className="border-b px-2 py-2">
                  <LookupField<InventoryLocation>
                    placeholder="Chọn vị trí"
                    value={row.locationCode}
                    onValueChange={(v) =>
                      updateRow(row.uid, {
                        locationCode: v,
                        locationId: null,
                      })
                    }
                    onSelect={(loc) =>
                      updateRow(row.uid, {
                        locationId: loc.id,
                        locationCode: `${loc.code} · ${loc.name}`,
                        // If user picked a location without choosing Kho first,
                        // back-fill the Kho from the location.
                        storageId: row.storageId ?? loc.storageId,
                        storageName: row.storageName || (loc.storageName ?? ""),
                      })
                    }
                    search={searchLocationsFor(row.storageId)}
                    itemKey={(loc) => loc.id}
                    renderItem={(loc) => loc.name}
                    renderMeta={(loc) => loc.code}
                    columns={[
                      {
                        key: "code",
                        label: "Mã",
                        className: "w-[110px] font-mono text-xs",
                        render: (loc) => loc.code,
                      },
                      {
                        key: "name",
                        label: "Tên vị trí",
                        render: (loc) => loc.name,
                      },
                    ]}
                    className="w-full"
                  />
                </td>

                {/* Trash */}
                <td className="border-b px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(row.uid)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Xóa dòng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Thêm dòng */}
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={addRow}
            disabled={submitting}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-primary-blue transition-colors hover:bg-primary-blue/10 hover:text-primary-blue-hover disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm dòng
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-4">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-1 text-sm text-primary-blue hover:text-primary-blue-hover hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Trợ giúp
          </a>
          <span className="text-sm text-muted-foreground">
            Số dòng = {rows.length}
            {validRowCount > 0 && (
              <span className="ml-2 text-foreground">
                · Sẽ xếp {validRowCount} dòng
              </span>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
            disabled={submitting}
            onClick={() => void handleSave()}
          >
            {submitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Lưu
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
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
              rows
                .find((row) => row.uid === productPickerRowId)
                ?.itemIds.filter(Boolean) ?? [],
            )
          }
          onConfirm={(result) => void applyProductSelection(result)}
        />
      ) : null}
    </AppModal>
  );
}
