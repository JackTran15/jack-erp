import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { AppModal, Button } from "@erp/ui";
import { LookupField } from "../../components/forms/LookupField";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { assignItemsBatch } from "../../api/stock-balances";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ItemSearchResult {
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
  itemId: string | null;
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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyRow(): ArrangeRow {
  return {
    uid: crypto.randomUUID(),
    itemId: null,
    itemCode: "",
    itemName: "",
    unit: "",
    storageId: null,
    storageName: "",
    locationId: null,
    locationCode: "",
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ArrangeLocationDialog({ open, onOpenChange, onSaved }: Props): ReactElement {
  const [rows, setRows] = useState<ArrangeRow[]>(() => [emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  // Reset when closed
  useEffect(() => {
    if (!open) setRows([emptyRow()]);
  }, [open]);

  // ─── Search functions ─────────────────────────────────────────────────────

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    if (query.trim()) params.set("search", query.trim());
    const { data: res } = await apiClient.get<PaginatedResponse<ItemSearchResult>>(
      `/inventory/items?${params}`,
    );
    return res.data;
  }, []);

  const searchStorages = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "20" });
    if (query.trim()) params.set("search", query.trim());
    const { data: res } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
      `/inventory/storages?${params}`,
    );
    return res.data;
  }, []);

  const searchLocationsFor = useCallback(
    (storageId: string | null) => async (query: string) => {
      const params = new URLSearchParams({ page: "1", pageSize: "20" });
      if (query.trim()) params.set("search", query.trim());
      if (storageId) params.set("storageId", storageId);
      const { data: res } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      return res.data;
    },
    [],
  );

  // ─── Row mutations ────────────────────────────────────────────────────────

  const updateRow = useCallback((uid: string, patch: Partial<ArrangeRow>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r));
      // Auto-append a fresh row once the last filled row has SKU + location
      const last = next[next.length - 1];
      if (last && last.itemId && last.locationId) {
        return [...next, emptyRow()];
      }
      return next;
    });
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

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const valid = rows.filter((r) => r.itemId && r.locationId);
    if (valid.length === 0) {
      toast.error("Chưa có dòng nào hợp lệ để lưu");
      return;
    }
    try {
      setSubmitting(true);
      await assignItemsBatch(
        valid.map((r) => ({ itemId: r.itemId!, locationId: r.locationId! })),
      );
      toast.success(`Đã xếp ${valid.length} hàng hoá thành công.`);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [rows, onSaved, onOpenChange]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Xếp vị trí hàng hoá"
      defaultWidth={960}
      defaultHeight={600}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-3">
        {/* Quét mã vạch (visual only, disabled) */}
        <label className="flex cursor-not-allowed items-center gap-1.5 text-sm text-muted-foreground opacity-50">
          <input type="checkbox" disabled />
          Quét mã vạch
        </label>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/90 text-left backdrop-blur">
            <tr>
              <th className="w-8 border-b px-2 py-2 text-center text-xs font-medium text-muted-foreground">#</th>
              <th className="w-44 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Mã SKU</th>
              <th className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Tên hàng hoá</th>
              <th className="w-44 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Kho</th>
              <th className="w-20 border-b px-3 py-2 text-xs font-medium text-muted-foreground">ĐVT</th>
              <th className="w-44 border-b px-3 py-2 text-xs font-medium text-muted-foreground">Vị trí</th>
              <th className="w-10 border-b px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.uid} className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                <td className="border-b px-2 py-1.5 text-center text-xs text-muted-foreground">
                  {idx + 1}
                </td>

                {/* Mã SKU — LookupField */}
                <td className="border-b px-2 py-1">
                  <LookupField<ItemSearchResult>
                    placeholder="Tìm mã hoặc tên"
                    value={row.itemCode}
                    onValueChange={(v) =>
                      updateRow(row.uid, {
                        itemCode: v,
                        itemId: null,
                        itemName: "",
                        unit: "",
                        storageName: "",
                      })
                    }
                    onSelect={(item) =>
                      updateRow(row.uid, {
                        itemId: item.id,
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
                      { key: "code", label: "Mã", className: "w-[110px] font-mono text-xs", render: (item) => item.code },
                      { key: "name", label: "Tên hàng hoá", render: (item) => item.name },
                    ]}
                    className="w-full"
                  />
                </td>

                {/* Tên hàng hoá — readonly */}
                <td className="border-b px-3 py-1.5 text-muted-foreground">
                  {row.itemName || <span className="opacity-40">—</span>}
                </td>

                {/* Kho — LookupField */}
                <td className="border-b px-2 py-1">
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

                {/* ĐVT — readonly */}
                <td className="border-b px-3 py-1.5 text-muted-foreground">
                  {row.unit || <span className="opacity-40">—</span>}
                </td>

                {/* Vị trí — LookupField, filtered by storage */}
                <td className="border-b px-2 py-1">
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
                <td className="border-b px-2 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(row.uid)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Xoá dòng"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addRow}
            disabled={submitting}
            className="flex items-center gap-1 rounded px-2 py-1 text-sm text-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm dòng
          </button>
          <span className="text-sm text-muted-foreground">Số dòng = {rows.length}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Hủy bỏ
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={submitting}
            onClick={() => void handleSave()}
          >
            Lưu
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
