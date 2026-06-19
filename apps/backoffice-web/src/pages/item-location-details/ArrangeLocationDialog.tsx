import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { HelpCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { AppModal, Button } from "@erp/ui";
import { LookupField } from "../../components/forms/LookupField";
import { apiClient } from "../../lib/api-axios";
import { getActiveBranch } from "../../lib/auth-storage";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { assignArrange, type ArrangeLine } from "../../api/stock-balances";
import { useTrailingEmptyRow } from "../../hooks/useTrailingEmptyRow";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductGroupSearchResult {
  type: "product" | "orphan";
  id: string;
  code: string;
  name: string;
  unit: string;
  itemCount: number;
}

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
  initialLocation = null,
}: Props): ReactElement {
  const [rows, setRows] = useState<ArrangeRow[]>(() => [emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  // Reset when closed
  useEffect(() => {
    if (!open) {
      setRows([emptyRow()]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialLocation) return;
    setRows([
      {
        ...emptyRow(),
        storageId: initialLocation.storageId,
        storageName: initialLocation.storageName ?? "",
        locationId: initialLocation.id,
        locationCode: `${initialLocation.code} · ${initialLocation.name}`,
      },
    ]);
  }, [open, initialLocation]);

  // Always keep exactly one blank trailing row (unified grid rule).
  useTrailingEmptyRow(rows, setRows, { isEmpty: isRowEmpty, makeEmpty: emptyRow });

  // ─── Search functions ─────────────────────────────────────────────────────

  const searchProductGroups = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    if (query.trim()) params.set("search", query.trim());
    const { data: res } = await apiClient.get<PaginatedResponse<ProductGroupSearchResult>>(
      `/inventory/items/products?${params}`,
    );
    return res.data;
  }, []);

  const searchStorages = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    const branchId = getActiveBranch();
    if (query.trim()) params.set("search", query.trim());
    if (branchId) params.set("branchId", branchId);
    const { data: res } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
      `/inventory/storages?${params}`,
    );
    return res.data;
  }, []);

  const searchLocationsFor = useCallback(
    (storageId: string | null) => async (query: string) => {
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      const branchId = getActiveBranch();
      if (query.trim()) params.set("search", query.trim());
      if (storageId) params.set("storageId", storageId);
      if (branchId) params.set("branchId", branchId);
      const { data: res } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      return res.data;
    },
    [],
  );

  // ─── Row mutations ────────────────────────────────────────────────────────

  const updateRow = useCallback((uid: string, patch: Partial<ArrangeRow>) => {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
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

  const resolveGroupItemIds = useCallback(async (row: ArrangeRow) => {
    if (!row.groupId || row.groupType !== "product") {
      return row.itemIds;
    }
    const params = new URLSearchParams({ page: "1", pageSize: "200" });
    const { data } = await apiClient.get<PaginatedResponse<ProductVariantSearchResult>>(
      `/inventory/items/products/${row.groupId}/items?${params}`,
    );
    return data.data.map((item) => item.id);
  }, []);

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const lines: ArrangeLine[] = [];
    for (const row of rows.filter(isRowComplete)) {
      const itemIds = await resolveGroupItemIds(row);
      for (const itemId of itemIds) {
        lines.push({
          itemId,
          storageId: row.storageId as string,
          destinationLocationId: row.locationId as string,
        });
      }
    }

    if (lines.length === 0) {
      toast.error("Chưa có dòng nào hợp lệ để xếp");
      return;
    }

    try {
      setSubmitting(true);
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
              <th className="w-8 border-b px-2 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
              <th className="w-48 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Mã nhóm/SKU</th>
              <th className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Hàng hóa</th>
              <th className="w-44 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Kho</th>
              <th className="w-28 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Đơn vị tính</th>
              <th className="w-48 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Vị trí</th>
              <th className="w-10 border-b px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.uid} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="border-b px-2 py-2 text-center text-xs text-muted-foreground">
                  {idx + 1}
                </td>

                {/* Mã nhóm/SKU — LookupField */}
                <td className="border-b px-2 py-2">
                  <LookupField<ProductGroupSearchResult>
                    placeholder="Tìm nhóm hoặc SKU"
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
                        groupType: item.type,
                        itemIds: item.type === "orphan" ? [item.id] : [item.id],
                        itemCode: item.code,
                        itemName: item.name,
                        unit: item.unit,
                      })
                    }
                    search={searchProductGroups}
                    itemKey={(item) => item.id}
                    renderItem={(item) => item.name}
                    renderMeta={(item) =>
                      item.type === "product"
                        ? `${item.code} · ${item.itemCount} biến thể`
                        : item.code
                    }
                    columns={[
                      { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (item) => item.code },
                      { key: "name", label: "Tên hàng hóa", render: (item) => item.name },
                      {
                        key: "itemCount",
                        label: "Biến thể",
                        className: "w-[80px] text-right",
                        render: (item) => (item.type === "product" ? item.itemCount : 1),
                      },
                    ]}
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
                      { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (loc) => loc.code },
                      { key: "name", label: "Tên vị trí", render: (loc) => loc.name },
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
              <span className="ml-2 text-foreground">· Sẽ xếp {validRowCount} dòng</span>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={submitting}
            onClick={() => void handleSave()}
          >
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
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
    </AppModal>
  );
}
