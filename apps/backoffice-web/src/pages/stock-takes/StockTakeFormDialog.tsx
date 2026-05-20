import { useCallback, useRef, useState } from "react";
import {
  DocumentFormDialog,
  FormField,
  Input,
  LineItemGrid,
  Textarea,
  UnsavedChangesDialog,
  type LineColumn,
  type ToolbarItem,
  type UnsavedChangesChoice,
} from "@erp/ui";
import {
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { LookupField } from "../../components/forms/LookupField";
import type { StockTakeDraft } from "./CreateStockTakeDialog";
import type {
  ItemOption,
  LocationOption,
  PaginatedResponse,
  StockTake,
  StockTakeLine,
} from "./stock-takes.types";

interface Props {
  /** Edit mode is detected by the presence of `initialStockTake`. */
  initialStockTake?: StockTake;
  /** New-mode seed values from CreateStockTakeDialog. Required when `initialStockTake` is null. */
  initialDraft?: StockTakeDraft;
  /** Override storage display name when known on the page level. */
  storageName?: string;
  /**
   * Display-only preview of the next "Số phiếu KK" — shown in new-mode so the
   * user sees a concrete number without us reserving one on the server.
   */
  previewDocumentNumber?: string;
  onClose: () => void;
  /** Called after any successful save / process so the list page can refresh. */
  onSaved: () => Promise<void> | void;
  onRequestDelete?: () => void;
}

interface LineRow {
  /** Server-side line id if persisted; undefined while still local. */
  id?: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  locationId: string;
  locationCode: string;
  expectedQty: number;
  countedQty: number | null;
  reason: string;
}

/** Stock balance shape returned by GET /inventory/stock/balances. */
interface BalanceRow {
  itemId: string;
  locationId: string;
  quantity: number | string;
  location?: { code: string; name: string };
  item?: { unit: string };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function splitDateTime(iso: string | null | undefined): { date: string; time: string } {
  const d = iso ? new Date(iso) : new Date();
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return { date, time };
}

function combineDateTime(date: string, time: string): string {
  // Interprets as local time → ISO.
  return new Date(`${date}T${time}:00`).toISOString();
}

function emptyRow(): LineRow {
  return {
    id: undefined,
    itemId: "",
    itemCode: "",
    itemName: "",
    unit: "",
    locationId: "",
    locationCode: "",
    expectedQty: 0,
    countedQty: null,
    reason: "",
  };
}

function toLineRow(l: StockTakeLine): LineRow {
  return {
    id: l.id,
    itemId: l.itemId,
    itemCode: l.item?.code ?? l.itemId.slice(0, 8),
    itemName: l.item?.name ?? "",
    unit: l.item?.unit ?? "",
    locationId: l.locationId,
    locationCode: l.location?.code ?? l.locationId.slice(0, 8),
    expectedQty: Number(l.expectedQty || 0),
    countedQty: l.countedQty == null ? null : Number(l.countedQty),
    reason: l.reason ?? "",
  };
}

export function StockTakeFormDialog({
  initialStockTake,
  initialDraft,
  storageName,
  previewDocumentNumber,
  onClose,
  onSaved,
  onRequestDelete,
}: Props) {
  // Internal current snapshot — flips from null → entity after the first save in new mode.
  const [stockTake, setStockTake] = useState<StockTake | null>(initialStockTake ?? null);
  const isNew = !stockTake;
  const isLocked = stockTake ? stockTake.status !== "DRAFT" : false;

  // Effective storage / planned date — comes either from the saved entity or the new-mode draft.
  const effectiveStorageId = stockTake?.storageId ?? initialDraft?.storageId ?? "";
  const effectiveStorageName = storageName ?? initialDraft?.storageName ?? "";
  const effectivePlannedDate = stockTake?.plannedDate ?? initialDraft?.plannedDate ?? "";

  // ─── Header form state ───────────────────────────────────────────────────
  const [purpose, setPurpose] = useState(stockTake?.purpose ?? "");
  const [conclusion, setConclusion] = useState(stockTake?.conclusion ?? "");
  const initialDateTime = splitDateTime(stockTake?.countedAt ?? stockTake?.createdAt);
  const [countDate, setCountDate] = useState(initialDateTime.date);
  const [countTime, setCountTime] = useState(initialDateTime.time);

  // ─── Lines state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<LineRow[]>(() =>
    (stockTake?.lines ?? []).map(toLineRow),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const markDirty = useCallback(() => {
    if (!dirtyRef.current) setDirty(true);
  }, []);

  // ─── Lookups ─────────────────────────────────────────────────────────────
  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize ?? 20),
        search: query.trim(),
      });
      const { data } = await apiClient.get<PaginatedResponse<ItemOption>>(
        `/inventory/items?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  const searchLocationsForStorage = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      if (!effectiveStorageId) return { items: [], hasMore: false, total: 0 };
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize ?? 20),
        search: query.trim(),
        storageId: effectiveStorageId,
      });
      const { data } = await apiClient.get<PaginatedResponse<LocationOption>>(
        `/inventory/locations?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [effectiveStorageId],
  );

  /** Find the location holding stock for this item within the active storage. */
  const fetchFirstBalance = useCallback(
    async (itemId: string): Promise<BalanceRow | null> => {
      if (!effectiveStorageId) return null;
      const params = new URLSearchParams({
        page: "1",
        pageSize: "1",
        itemId,
        storageId: effectiveStorageId,
      });
      const { data } = await apiClient.get<PaginatedResponse<BalanceRow>>(
        `/inventory/stock/balances?${params}`,
      );
      return data.data[0] ?? null;
    },
    [effectiveStorageId],
  );

  /** Fallback when item has no balance — use first location of the storage. */
  const fetchFirstLocation = useCallback(async (): Promise<LocationOption | null> => {
    if (!effectiveStorageId) return null;
    const params = new URLSearchParams({
      page: "1",
      pageSize: "1",
      storageId: effectiveStorageId,
    });
    const { data } = await apiClient.get<PaginatedResponse<LocationOption>>(
      `/inventory/locations?${params}`,
    );
    return data.data[0] ?? null;
  }, [effectiveStorageId]);

  // ─── Row mutations ───────────────────────────────────────────────────────

  /** Add a pending empty row (UI only — no API call ever). */
  const handleAddPendingRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  /** Triggered when user picks an item in the row's SKU lookup. */
  const handlePickItem = useCallback(
    async (item: ItemOption, rowIndex: number) => {
      // Resolve location + expected qty.
      const balance = await fetchFirstBalance(item.id);
      let locationId = balance?.locationId ?? "";
      let locationCode = balance?.location?.code ?? "";
      let expectedQty = balance ? Number(balance.quantity) : 0;

      if (!locationId) {
        const fallback = await fetchFirstLocation();
        if (!fallback) {
          toast.error(
            "Kho được chọn chưa có vị trí nào — tạo vị trí trước khi kiểm kê.",
          );
          return;
        }
        locationId = fallback.id;
        locationCode = fallback.code;
        expectedQty = 0;
      }

      if (isNew || !stockTake) {
        // Local-only: just update the row.
        setRows((prev) =>
          prev.map((r, i) =>
            i === rowIndex
              ? {
                  ...r,
                  itemId: item.id,
                  itemCode: item.code,
                  itemName: item.name,
                  unit: item.unit,
                  locationId,
                  locationCode,
                  expectedQty,
                }
              : r,
          ),
        );
        markDirty();
        return;
      }

      // Edit mode: persist via API so the row gets a server id.
      try {
        const { data } = await apiClient.post<{
          id: string;
          itemId: string;
          locationId: string;
          expectedQty: string | number;
          item?: { code: string; name: string; unit: string };
          location?: { code: string };
        }>(`/inventory/stock-takes/${stockTake.id}/lines`, {
          itemId: item.id,
          locationId,
        });
        setRows((prev) =>
          prev.map((r, i) =>
            i === rowIndex
              ? {
                  id: data.id,
                  itemId: data.itemId,
                  itemCode: data.item?.code ?? item.code,
                  itemName: data.item?.name ?? item.name,
                  unit: data.item?.unit ?? item.unit,
                  locationId: data.locationId,
                  locationCode: data.location?.code ?? data.locationId.slice(0, 8),
                  expectedQty: Number(data.expectedQty || 0),
                  countedQty: null,
                  reason: "",
                }
              : r,
          ),
        );
        markDirty();
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [fetchFirstBalance, fetchFirstLocation, isNew, stockTake, markDirty],
  );

  const handleDeleteRow = useCallback(
    async (rowIndex: number) => {
      const row = rows[rowIndex];
      if (!row) return;
      // Local row, or new mode → drop from state only.
      if (!row.id || !stockTake) {
        setRows((prev) => prev.filter((_, i) => i !== rowIndex));
        markDirty();
        return;
      }
      try {
        await apiClient.delete(
          `/inventory/stock-takes/${stockTake.id}/lines/${row.id}`,
        );
        setRows((prev) => prev.filter((_, i) => i !== rowIndex));
        markDirty();
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [rows, stockTake, markDirty],
  );

  // ─── Save ────────────────────────────────────────────────────────────────

  /**
   * "Lưu" — saves the form.
   * - New mode: POST /stock-takes with all lines bundled → server returns saved entity.
   *   We then switch to edit mode internally so subsequent edits go line-by-line.
   * - Edit mode: PATCH header + per-line PATCH for any pending counted/reason edits.
   */
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (isLocked) return true;
    setSaving(true);
    try {
      if (!stockTake) {
        // New mode — must have a draft.
        if (!initialDraft) {
          toast.error("Thiếu thông tin kho — không thể lưu.");
          return false;
        }
        const validRows = rows.filter((r) => r.itemId);
        const payload = {
          storageId: initialDraft.storageId,
          plannedDate: initialDraft.plannedDate,
          purpose: purpose || undefined,
          conclusion: conclusion || undefined,
          countedAt: combineDateTime(countDate, countTime),
          lines: validRows.map((r) => ({
            itemId: r.itemId,
            locationId: r.locationId || undefined,
            countedQty: r.countedQty,
            reason: r.reason || undefined,
          })),
        };
        const { data } = await apiClient.post<StockTake>(
          "/inventory/stock-takes",
          payload,
        );
        // Switch to edit mode: re-seed rows from server (server may reorder ids).
        setStockTake(data);
        setRows(data.lines.map(toLineRow));
        setDirty(false);
        toast.success(`Đã tạo phiếu ${data.documentNumber ?? ""}.`);
        await onSaved();
        return true;
      }

      // Edit mode.
      await apiClient.patch(`/inventory/stock-takes/${stockTake.id}`, {
        purpose: purpose || undefined,
        conclusion: conclusion || undefined,
        countedAt: combineDateTime(countDate, countTime),
      });
      for (const r of rows) {
        if (!r.id) continue;
        await apiClient.patch(
          `/inventory/stock-takes/${stockTake.id}/lines/${r.id}`,
          {
            countedQty: r.countedQty,
            reason: r.reason || undefined,
          },
        );
      }
      setDirty(false);
      toast.success("Đã lưu phiếu kiểm kê.");
      await onSaved();
      return true;
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    isLocked,
    stockTake,
    initialDraft,
    rows,
    purpose,
    conclusion,
    countDate,
    countTime,
    onSaved,
  ]);

  // ─── Close handling ──────────────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (dirtyRef.current && !isLocked) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  }, [isLocked, onClose]);

  const handleUnsavedChoice = useCallback(
    async (choice: UnsavedChangesChoice) => {
      setUnsavedOpen(false);
      if (choice === "save") {
        const ok = await handleSave();
        if (ok) onClose();
      } else if (choice === "discard") {
        onClose();
      }
    },
    [handleSave, onClose],
  );

  // ─── Toolbar ─────────────────────────────────────────────────────────────
  const toolbarItems: ToolbarItem[] = [
    { id: "prev", label: "Trước", icon: ChevronLeft, disabled: true, onClick: () => {} },
    { id: "next", label: "Sau", icon: ChevronRight, disabled: true, onClick: () => {} },
    { id: "sep1", type: "separator" },
    { id: "new", label: "Thêm mới", icon: Plus, disabled: true, onClick: () => {} },
    { id: "edit", label: "Sửa", icon: Pencil, disabled: true, onClick: () => {} },
    {
      id: "save",
      label: "Lưu",
      icon: Save,
      disabled: isLocked || saving,
      onClick: () => void handleSave(),
    },
    {
      id: "delete",
      label: "Xoá",
      icon: Trash2,
      variant: "danger",
      disabled: !onRequestDelete || isLocked || isNew,
      onClick: () => onRequestDelete?.(),
    },
    { id: "void", label: "Hoãn", icon: RotateCcw, disabled: true, onClick: () => {} },
    { id: "sep2", type: "separator" },
    { id: "print", label: "In", icon: Printer, disabled: true, onClick: () => {} },
    { id: "export", label: "Xuất khẩu", icon: CloudUpload, disabled: true, onClick: () => {} },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, disabled: true, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  // ─── Line columns ────────────────────────────────────────────────────────
  const lineColumns: LineColumn<LineRow>[] = [
    {
      key: "itemCode",
      label: "Mã SKU",
      width: 200,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn hàng hóa"
          searchModalPlaceholder="Nhập mã SKU hoặc tên hàng hóa"
          dropdownMinWidth={520}
          placeholder="Tìm mã hoặc tên"
          value={row.itemCode}
          onValueChange={() => {
            /* free-text typing has no semantic meaning here — selection only */
          }}
          onSelect={(item) => void handlePickItem(item, idx)}
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            { key: "code", label: "Mã SKU", className: "w-[120px] font-mono", render: (it) => it.code },
            { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
            { key: "unit", label: "ĐVT", className: "w-[80px]", render: (it) => it.unit },
          ]}
          disabled={isLocked || !!row.itemId}
          className="h-full"
        />
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 240,
      type: "readonly",
      getValue: (r) => r.itemName,
    },
    {
      key: "locationCode",
      label: "Vị trí",
      width: 140,
      placeholder: "Vị trí",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn vị trí"
          searchModalPlaceholder="Nhập mã hoặc tên vị trí"
          dropdownMinWidth={360}
          placeholder="Vị trí"
          value={row.locationCode}
          onValueChange={() => {}}
          onSelect={(loc) => {
            setRows((prev) =>
              prev.map((r, i) =>
                i === idx
                  ? { ...r, locationId: loc.id, locationCode: loc.code }
                  : r,
              ),
            );
            markDirty();
          }}
          search={searchLocationsForStorage}
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (l) => l.code },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={isLocked || !row.itemId}
          className="h-full"
        />
      ),
    },
    {
      key: "unit",
      label: "ĐVT",
      width: 80,
      type: "readonly",
      getValue: (r) => r.unit,
    },
    {
      key: "expectedQty",
      label: "Theo số",
      width: 100,
      type: "readonly",
      align: "right",
      getValue: (r) => r.expectedQty.toLocaleString("vi-VN"),
    },
    {
      key: "countedQty",
      label: "Kiểm kê",
      width: 110,
      align: "right",
      renderEditor: (row, idx) => (
        <Input
          type="number"
          min={0}
          className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none focus-visible:ring-0"
          value={row.countedQty == null ? "" : String(row.countedQty)}
          onChange={(e) => {
            const next = e.target.value === "" ? null : Number(e.target.value);
            setRows((prev) =>
              prev.map((r, i) => (i === idx ? { ...r, countedQty: next } : r)),
            );
            markDirty();
          }}
          disabled={isLocked || !row.itemId}
        />
      ),
    },
    {
      key: "variance",
      label: "Chênh lệch",
      width: 100,
      type: "readonly",
      align: "right",
      getValue: (r) => {
        if (r.countedQty == null) return "—";
        const v = r.countedQty - r.expectedQty;
        return v > 0 ? `+${v.toLocaleString("vi-VN")}` : v.toLocaleString("vi-VN");
      },
    },
    {
      key: "reason",
      label: "Nguyên nhân",
      width: 240,
      renderEditor: (row, idx) => (
        <Input
          type="text"
          className="h-full w-full rounded-none border-0 bg-transparent px-2 text-left shadow-none focus-visible:ring-0"
          value={row.reason}
          onChange={(e) => {
            const v = e.target.value;
            setRows((prev) =>
              prev.map((r, i) => (i === idx ? { ...r, reason: v } : r)),
            );
            markDirty();
          }}
          disabled={isLocked || !row.itemId}
        />
      ),
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────
  const title = isNew
    ? "Thêm mới kiểm kê kho"
    : isLocked
      ? `Phiếu kiểm kê ${stockTake?.documentNumber ?? ""}`
      : `Sửa phiếu kiểm kê ${stockTake?.documentNumber ?? ""}`;

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={title}
        toolbarItems={toolbarItems}
        defaultWidth={1180}
        defaultHeight={760}
        generalInfo={
          <>
            <FormField label="Mục đích">
              <Input
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  markDirty();
                }}
                disabled={isLocked}
                className="h-8"
              />
            </FormField>
            <FormField label="Kho kiểm kê">
              <Input
                value={effectiveStorageName || effectiveStorageId}
                disabled
                className="h-8 bg-muted/40"
              />
            </FormField>
            <FormField label="Kiểm kê đến ngày">
              <Input
                type="date"
                value={effectivePlannedDate}
                disabled
                className="h-8 bg-muted/40"
              />
            </FormField>
          </>
        }
        documentInfo={
          <>
            <FormField label="Số phiếu KK">
              <Input
                value={
                  stockTake?.documentNumber ?? previewDocumentNumber ?? ""
                }
                disabled
                className="h-8 bg-muted/40 font-mono"
              />
            </FormField>
            <FormField label="Ngày kiểm kê">
              <Input
                type="date"
                value={countDate}
                onChange={(e) => {
                  setCountDate(e.target.value);
                  markDirty();
                }}
                disabled={isLocked}
                className="h-8"
              />
            </FormField>
            <FormField label="Giờ kiểm kê">
              <Input
                type="time"
                value={countTime}
                onChange={(e) => {
                  setCountTime(e.target.value);
                  markDirty();
                }}
                disabled={isLocked}
                className="h-8"
              />
            </FormField>
          </>
        }
        detail={
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <LineItemGrid
                columns={lineColumns}
                rows={rows}
                onDeleteRow={(idx) => void handleDeleteRow(idx)}
                showRowActions={!isLocked}
                showAddRow={!isLocked}
                onAddRow={handleAddPendingRow}
                emptyText="Tìm mã hoặc tên"
              />
            </div>
            <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kết luận
              </div>
              <Textarea
                rows={2}
                value={conclusion}
                onChange={(e) => {
                  setConclusion(e.target.value);
                  markDirty();
                }}
                disabled={isLocked}
                placeholder="Nhập kết luận sau khi kiểm kê…"
              />
            </div>
          </div>
        }
      />

      {unsavedOpen ? (
        <UnsavedChangesDialog
          open
          onChoose={(c) => void handleUnsavedChoice(c)}
          onOpenChange={(o) => {
            if (!o) setUnsavedOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
