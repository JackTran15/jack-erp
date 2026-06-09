import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
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
  /** Open the "Xử lý" confirm for a saved DRAFT phiếu. */
  onRequestProcess?: (st: StockTake) => void;
  /** Open another stock-take referenced by this voucher. */
  onOpenStockTakeReference?: (id: string) => void;
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
  expectedValue: number;
  countedValue: number | null;
  reason: string;
}

interface MemberRow {
  id?: string;
  fullName: string;
  title: string;
  representative: string;
}

/** Stock balance shape returned by GET /inventory/stock/balances. */
interface BalanceRow {
  itemId: string;
  locationId: string;
  quantity: number | string;
  location?: { code: string; name: string };
  item?: { unit: string };
}

type DetailTab = "items" | "members";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function splitDateTime(iso: string | null | undefined): {
  date: string;
  time: string;
} {
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
    expectedValue: 0,
    countedValue: null,
    reason: "",
  };
}

function emptyMemberRow(): MemberRow {
  return { fullName: "", title: "", representative: "" };
}

function normalizeText(value: string | number | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function ensureTrailingEmptyRow(rows: LineRow[], locked: boolean): LineRow[] {
  if (locked) return rows.filter((row) => row.itemId);
  const withoutExtraEmpty = rows.filter(
    (row, index) => row.itemId || index === rows.findIndex((r) => !r.itemId),
  );
  return withoutExtraEmpty.some((row) => !row.itemId)
    ? withoutExtraEmpty
    : [...withoutExtraEmpty, emptyRow()];
}

function ensureTrailingEmptyMember(
  rows: MemberRow[],
  locked: boolean,
): MemberRow[] {
  if (locked)
    return rows.filter(
      (row) => row.fullName || row.title || row.representative,
    );
  const firstEmptyIndex = rows.findIndex(
    (row) => !row.fullName && !row.title && !row.representative,
  );
  const withoutExtraEmpty = rows.filter(
    (row, index) =>
      row.fullName ||
      row.title ||
      row.representative ||
      index === firstEmptyIndex,
  );
  return withoutExtraEmpty.some(
    (row) => !row.fullName && !row.title && !row.representative,
  )
    ? withoutExtraEmpty
    : [...withoutExtraEmpty, emptyMemberRow()];
}

function parseStockTakeCsv(text: string): Array<{
  itemCode: string;
  countedQty: number | null;
  reason: string;
}> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = parseCsvLine(lines[0]).map((h) => normalizeText(h));
  const codeIdx = headers.findIndex(
    (h) => h.includes("mã sku") || h.includes("ma sku") || h === "sku",
  );
  const countedIdx = headers.findIndex(
    (h) => h.includes("kiểm kê") || h.includes("kiem ke"),
  );
  const reasonIdx = headers.findIndex(
    (h) => h.includes("nguyên nhân") || h.includes("nguyen nhan"),
  );
  if (codeIdx < 0 || countedIdx < 0) return [];
  return lines
    .slice(1)
    .map((line) => {
      const cells = parseCsvLine(line);
      const rawQty = cells[countedIdx]?.replace(/\./g, "").replace(",", ".");
      const qty = rawQty === "" || rawQty == null ? null : Number(rawQty);
      return {
        itemCode: cells[codeIdx] ?? "",
        countedQty: Number.isFinite(qty) ? qty : null,
        reason: reasonIdx >= 0 ? (cells[reasonIdx] ?? "") : "",
      };
    })
    .filter((row) => row.itemCode);
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
    expectedValue: Number(l.expectedValue || 0),
    countedValue: l.countedValue == null ? null : Number(l.countedValue),
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
  onRequestProcess,
  onOpenStockTakeReference,
}: Props) {
  const navigate = useNavigate();
  // Internal current snapshot — flips from null → entity after the first save in new mode.
  const [stockTake, setStockTake] = useState<StockTake | null>(
    initialStockTake ?? null,
  );
  const isNew = !stockTake;
  const isLocked = stockTake
    ? stockTake.status !== "DRAFT" || !!stockTake.mergedIntoId
    : false;

  // Effective storage / planned date — comes either from the saved entity or the new-mode draft.
  const effectiveStorageId =
    stockTake?.storageId ?? initialDraft?.storageId ?? "";
  const effectiveStorageName = storageName ?? initialDraft?.storageName ?? "";
  const effectivePlannedDate =
    stockTake?.plannedDate ?? initialDraft?.plannedDate ?? "";

  // ─── Header form state ───────────────────────────────────────────────────
  const [purpose, setPurpose] = useState(
    stockTake?.purpose ?? initialDraft?.purpose ?? "",
  );
  const [countByValue, setCountByValue] = useState(
    !!(stockTake?.countByValue ?? initialDraft?.countByValue),
  );
  const [conclusion, setConclusion] = useState(
    stockTake?.conclusion ?? initialDraft?.conclusion ?? "",
  );
  const initialDateTime = splitDateTime(
    stockTake?.countedAt ?? stockTake?.createdAt ?? initialDraft?.countedAt,
  );
  const [countDate, setCountDate] = useState(initialDateTime.date);
  const [countTime, setCountTime] = useState(initialDateTime.time);

  // ─── Lines state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<LineRow[]>(() =>
    ensureTrailingEmptyRow(
      (stockTake?.lines ?? initialDraft?.lines ?? []).map(toLineRow),
      isLocked,
    ),
  );
  const [members, setMembers] = useState<MemberRow[]>(() =>
    ensureTrailingEmptyMember(
      (stockTake?.members ?? initialDraft?.members ?? []).map((member) => ({
        id: member.id,
        fullName: member.fullName,
        title: member.title ?? "",
        representative: member.representative ?? "",
      })),
      isLocked,
    ),
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [detailTab, setDetailTab] = useState<DetailTab>("items");
  const [scanBarcode, setScanBarcode] = useState(false);
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // "Tham chiếu": the NK/XK documents auto-generated when this stock-take was
  // processed. The API stores only their ids, so resolve the document numbers.
  const [refDocs, setRefDocs] = useState<{
    receipt?: string;
    issue?: string;
    mergeSources?: string[];
    mergedInto?: string;
  }>({});
  const refReceiptId = stockTake?.generatedReceiptId;
  const refIssueId = stockTake?.generatedIssueId;
  const refMergeSourceIds =
    stockTake?.mergeSourceIds ?? initialDraft?.mergeSourceIds ?? [];
  const refMergedIntoId = stockTake?.mergedIntoId;
  useEffect(() => {
    if (
      !refReceiptId &&
      !refIssueId &&
      !refMergeSourceIds.length &&
      !refMergedIntoId
    ) {
      setRefDocs({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: {
        receipt?: string;
        issue?: string;
        mergeSources?: string[];
        mergedInto?: string;
      } = {};
      try {
        if (refReceiptId) {
          const { data } = await apiClient.get<{ documentNumber?: string }>(
            `/goods-receipts/${refReceiptId}`,
          );
          next.receipt = data.documentNumber ?? undefined;
        }
        if (refIssueId) {
          const { data } = await apiClient.get<{ documentNumber?: string }>(
            `/inventory/goods-issues/${refIssueId}`,
          );
          next.issue = data.documentNumber ?? undefined;
        }
        if (refMergeSourceIds.length) {
          const sources = await Promise.all(
            refMergeSourceIds.map(async (id) => {
              const { data } = await apiClient.get<{ documentNumber?: string }>(
                `/inventory/stock-takes/${id}`,
              );
              return data.documentNumber ?? id.slice(0, 8);
            }),
          );
          next.mergeSources = sources;
        }
        if (refMergedIntoId) {
          const { data } = await apiClient.get<{ documentNumber?: string }>(
            `/inventory/stock-takes/${refMergedIntoId}`,
          );
          next.mergedInto =
            data.documentNumber ?? refMergedIntoId.slice(0, 8);
        }
      } catch {
        // best-effort — the reference is informational only
      }
      if (!cancelled) setRefDocs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [refReceiptId, refIssueId, refMergedIntoId, refMergeSourceIds.join(",")]);
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
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
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
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
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
  const fetchFirstLocation =
    useCallback(async (): Promise<LocationOption | null> => {
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

  const resolveItemDefaults = useCallback(
    async (item: ItemOption) => {
      const balance = await fetchFirstBalance(item.id);
      let locationId = balance?.locationId ?? "";
      let locationCode = balance?.location?.code ?? "";
      let expectedQty = balance ? Number(balance.quantity) : 0;

      if (!locationId) {
        const fallback = await fetchFirstLocation();
        if (!fallback) {
          throw new Error(
            "Kho được chọn chưa có vị trí nào — tạo vị trí trước khi kiểm kê.",
          );
        }
        locationId = fallback.id;
        locationCode = fallback.code;
        expectedQty = 0;
      }
      return { locationId, locationCode, expectedQty };
    },
    [fetchFirstBalance, fetchFirstLocation],
  );

  /** Triggered when user picks an item in the row's SKU lookup. */
  const handlePickItem = useCallback(
    async (item: ItemOption, rowIndex: number) => {
      // A row can only be resolved against a concrete storage. Without one we
      // can't look up a location — surface that instead of failing silently.
      if (!effectiveStorageId) {
        toast.error("Chưa chọn kho kiểm kê — không thể thêm hàng hóa.");
        return;
      }

      // Resolve location + expected qty. Network failures here would otherwise
      // be an unhandled rejection that drops the picked item with no feedback.
      let defaults: Awaited<ReturnType<typeof resolveItemDefaults>>;
      try {
        defaults = await resolveItemDefaults(item);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : getUserFacingApiErrorMessage(err),
        );
        return;
      }

      if (isNew || !stockTake) {
        // Local-only: just update the row.
        setRows((prev) =>
          ensureTrailingEmptyRow(
            prev.map((r, i) =>
              i === rowIndex
                ? {
                    ...r,
                    itemId: item.id,
                    itemCode: item.code,
                    itemName: item.name,
                    unit: item.unit,
                    locationId: defaults.locationId,
                    locationCode: defaults.locationCode,
                    expectedQty: defaults.expectedQty,
                    expectedValue: 0,
                    countedValue: null,
                  }
                : r,
            ),
            false,
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
          expectedValue?: string | number;
          item?: { code: string; name: string; unit: string };
          location?: { code: string };
        }>(`/inventory/stock-takes/${stockTake.id}/lines`, {
          itemId: item.id,
          locationId: defaults.locationId,
        });
        setRows((prev) =>
          ensureTrailingEmptyRow(
            prev.map((r, i) =>
              i === rowIndex
                ? {
                    id: data.id,
                    itemId: data.itemId,
                    itemCode: data.item?.code ?? item.code,
                    itemName: data.item?.name ?? item.name,
                    unit: data.item?.unit ?? item.unit,
                    locationId: data.locationId,
                    locationCode:
                      data.location?.code ?? data.locationId.slice(0, 8),
                    expectedQty: Number(data.expectedQty || 0),
                    countedQty: null,
                    expectedValue: Number(data.expectedValue || 0),
                    countedValue: null,
                    reason: "",
                  }
                : r,
            ),
            false,
          ),
        );
        markDirty();
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [effectiveStorageId, resolveItemDefaults, isNew, stockTake, markDirty],
  );

  const handleDeleteRow = useCallback(
    async (rowIndex: number) => {
      const row = rows[rowIndex];
      if (!row) return;
      // Local row, or new mode → drop from state only.
      if (!row.id || !stockTake) {
        setRows((prev) => {
          const next = prev.filter((_, i) => i !== rowIndex);
          return ensureTrailingEmptyRow(next, false);
        });
        markDirty();
        return;
      }
      try {
        await apiClient.delete(
          `/inventory/stock-takes/${stockTake.id}/lines/${row.id}`,
        );
        setRows((prev) => {
          const next = prev.filter((_, i) => i !== rowIndex);
          return ensureTrailingEmptyRow(next, false);
        });
        markDirty();
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      }
    },
    [rows, stockTake, markDirty],
  );

  const visibleRowEntries = useMemo(() => {
    const active = Object.entries(filters).filter(([, value]) => value.trim());
    const entries = rows.map((row, sourceIndex) => ({ row, sourceIndex }));
    if (active.length === 0) return entries;
    return entries.filter(({ row }) =>
      active.every(([key, value]) => {
        const needle = normalizeText(value);
        const text =
          key === "variance"
            ? row.countedQty == null
              ? ""
              : String(row.countedQty - row.expectedQty)
            : normalizeText(
                (
                  row as unknown as Record<
                    string,
                    string | number | null | undefined
                  >
                )[key],
              );
        return text.includes(needle);
      }),
    );
  }, [filters, rows]);
  const visibleRows = visibleRowEntries.map((entry) => entry.row);
  const sourceIndexForVisible = useCallback(
    (visibleIndex: number) =>
      visibleRowEntries[visibleIndex]?.sourceIndex ?? visibleIndex,
    [visibleRowEntries],
  );

  const handleExportExcel = useCallback(async () => {
    if (!stockTake) return;
    try {
      const { data } = await apiClient.get<Blob>(
        `/inventory/stock-takes/${stockTake.id}/export.xlsx`,
        { responseType: "blob" },
      );
      triggerBlobDownload(data, "Phieu_kiem_ke.xlsx");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  }, [stockTake]);

  const handleImportFile = useCallback(
    async (file: File) => {
      if (!effectiveStorageId) {
        toast.error("Chưa chọn kho kiểm kê — không thể nhập khẩu.");
        return;
      }
      const parsed = parseStockTakeCsv(await file.text());
      if (parsed.length === 0) {
        toast.error("File nhập khẩu cần có cột Mã SKU và Kiểm kê.");
        return;
      }
      try {
        const importedRows: LineRow[] = [];
        for (const line of parsed) {
          const found = await searchItems(line.itemCode, 1, 10);
          const item =
            found.items.find((it) => it.code === line.itemCode) ??
            found.items[0];
          if (!item) continue;
          const defaults = await resolveItemDefaults(item);
          importedRows.push({
            ...emptyRow(),
            itemId: item.id,
            itemCode: item.code,
            itemName: item.name,
            unit: item.unit,
            locationId: defaults.locationId,
            locationCode: defaults.locationCode,
            expectedQty: defaults.expectedQty,
            expectedValue: 0,
            countedValue: null,
            countedQty: line.countedQty,
            reason: line.reason,
          });
        }
        if (importedRows.length === 0) {
          toast.error("Không tìm thấy hàng hóa nào trong file nhập khẩu.");
          return;
        }
        if (stockTake) {
          const persistedRows: LineRow[] = [];
          for (const row of importedRows) {
            const existing = rows.find((r) => r.itemId === row.itemId && r.id);
            if (existing?.id) {
              await apiClient.patch(
                `/inventory/stock-takes/${stockTake.id}/lines/${existing.id}`,
                {
                  countedQty: row.countedQty,
                  countedValue: row.countedValue,
                  reason: row.reason || undefined,
                },
              );
              persistedRows.push({ ...existing, ...row, id: existing.id });
              continue;
            }
            const { data } = await apiClient.post<{
              id: string;
              itemId: string;
              locationId: string;
              expectedQty: string | number;
              expectedValue?: string | number;
              item?: { code: string; name: string; unit: string };
              location?: { code: string };
            }>(`/inventory/stock-takes/${stockTake.id}/lines`, {
              itemId: row.itemId,
              locationId: row.locationId,
            });
            await apiClient.patch(
              `/inventory/stock-takes/${stockTake.id}/lines/${data.id}`,
              {
                countedQty: row.countedQty,
                countedValue: row.countedValue,
                reason: row.reason || undefined,
              },
            );
            persistedRows.push({
              ...row,
              id: data.id,
              expectedQty: Number(data.expectedQty || row.expectedQty),
              expectedValue: Number(data.expectedValue || row.expectedValue),
              locationId: data.locationId,
              locationCode: data.location?.code ?? row.locationCode,
            });
          }
          setRows((prev) => {
            const keyed = new Map(
              prev.filter((r) => r.itemId).map((r) => [r.itemId, r]),
            );
            persistedRows.forEach((row) => {
              keyed.set(row.itemId, {
                ...(keyed.get(row.itemId) ?? row),
                ...row,
              });
            });
            return ensureTrailingEmptyRow([...keyed.values()], false);
          });
          setDirty(false);
          await onSaved();
          toast.success(`Đã nhập ${persistedRows.length} dòng kiểm kê.`);
          return;
        }
        setRows((prev) => {
          const keyed = new Map(
            prev.filter((r) => r.itemId).map((r) => [r.itemId, r]),
          );
          importedRows.forEach((row) => {
            keyed.set(row.itemId, {
              ...(keyed.get(row.itemId) ?? row),
              ...row,
            });
          });
          return ensureTrailingEmptyRow([...keyed.values()], false);
        });
        markDirty();
        toast.success(`Đã nhập ${importedRows.length} dòng kiểm kê.`);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : getUserFacingApiErrorMessage(err),
        );
      }
    },
    [
      effectiveStorageId,
      markDirty,
      onSaved,
      resolveItemDefaults,
      rows,
      searchItems,
      stockTake,
    ],
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
          countByValue,
          conclusion: conclusion || undefined,
          countedAt: combineDateTime(countDate, countTime),
          mergeSourceIds: initialDraft.mergeSourceIds,
          lines: validRows.map((r) => ({
            itemId: r.itemId,
            locationId: r.locationId || undefined,
            countedQty: r.countedQty,
            countedValue: r.countedValue,
            reason: r.reason || undefined,
          })),
          members: members
            .filter((m) => m.fullName || m.title || m.representative)
            .map((m) => ({
              fullName: m.fullName,
              title: m.title || undefined,
              representative: m.representative || undefined,
            })),
        };
        const { data } = await apiClient.post<StockTake>(
          "/inventory/stock-takes",
          payload,
        );
        // Reflect the saved entity locally before any callbacks read state.
        setStockTake(data);
        setRows(data.lines.map(toLineRow));
        setDirty(false);
        toast.success(`Đã tạo phiếu ${data.documentNumber ?? ""}.`);
        // New phiếu is persisted — close back to the list so the user can
        // process it from the toolbar / inline "Xử lý". onClose reloads.
        await onSaved();
        onClose();
        return true;
      }

      // Edit mode.
      await apiClient.patch(`/inventory/stock-takes/${stockTake.id}`, {
        purpose: purpose || undefined,
        countByValue,
        conclusion: conclusion || undefined,
        countedAt: combineDateTime(countDate, countTime),
      });
      await apiClient.put(`/inventory/stock-takes/${stockTake.id}/members`, {
        members: members
          .filter((m) => m.fullName || m.title || m.representative)
          .map((m) => ({
            fullName: m.fullName,
            title: m.title || undefined,
            representative: m.representative || undefined,
          })),
      });
      for (const r of rows) {
        if (!r.id) continue;
        await apiClient.patch(
          `/inventory/stock-takes/${stockTake.id}/lines/${r.id}`,
          {
            countedQty: r.countedQty,
            countedValue: r.countedValue,
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
    countByValue,
    conclusion,
    members,
    countDate,
    countTime,
    onSaved,
    onClose,
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
    {
      id: "prev",
      label: "Trước",
      icon: ChevronLeft,
      disabled: true,
      onClick: () => {},
    },
    {
      id: "next",
      label: "Sau",
      icon: ChevronRight,
      disabled: true,
      onClick: () => {},
    },
    { id: "sep1", type: "separator" },
    {
      id: "new",
      label: "Thêm mới",
      icon: Plus,
      disabled: true,
      onClick: () => {},
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: true,
      onClick: () => {},
    },
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
    {
      id: "void",
      label: "Hoãn",
      icon: RotateCcw,
      disabled: true,
      onClick: () => {},
    },
    { id: "sep2", type: "separator" },
    {
      id: "print",
      label: "In",
      icon: Printer,
      disabled: true,
      onClick: () => {},
    },
    {
      id: "export",
      label: "Xuất khẩu",
      icon: Download,
      disabled: isNew,
      onClick: () => void handleExportExcel(),
    },
    {
      id: "help",
      label: "Trợ giúp",
      icon: HelpCircle,
      disabled: true,
      onClick: () => {},
    },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  const countedRows = rows.filter((row) => row.itemId);
  const totalExpected = countedRows.reduce(
    (sum, row) => sum + row.expectedQty,
    0,
  );
  const totalCounted = countedRows.reduce(
    (sum, row) => sum + (row.countedQty ?? 0),
    0,
  );
  const totalExpectedValue = countedRows.reduce(
    (sum, row) => sum + row.expectedValue,
    0,
  );
  const totalCountedValue = countedRows.reduce(
    (sum, row) => sum + (row.countedValue ?? 0),
    0,
  );

  // ─── Line columns ────────────────────────────────────────────────────────
  const lineColumns: LineColumn<LineRow>[] = [
    {
      key: "itemCode",
      label: "Mã SKU",
      width: 200,
      placeholder: "Tìm mã hoặc tên",
      footer: `Số dòng = ${countedRows.length}`,
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
          onSelect={(item) =>
            void handlePickItem(item, sourceIndexForVisible(idx))
          }
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            {
              key: "code",
              label: "Mã SKU",
              className: "w-[120px]",
              render: (it) => it.code,
            },
            { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
            {
              key: "unit",
              label: "ĐVT",
              className: "w-[80px]",
              render: (it) => it.unit,
            },
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
            const sourceIndex = sourceIndexForVisible(idx);
            setRows((prev) =>
              prev.map((r, i) =>
                i === sourceIndex
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
            {
              key: "code",
              label: "Mã",
              className: "w-[120px]",
              render: (l) => l.code,
            },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={isLocked || !row.itemId}
          className="h-full"
        />
      ),
    },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 80,
      type: "readonly",
      getValue: (r) => r.unit,
    },
    {
      key: "expectedQty",
      label: "Theo sổ",
      group: "Số lượng",
      width: 100,
      type: "readonly",
      align: "right",
      footer: totalExpected.toLocaleString("vi-VN"),
      getValue: (r) => r.expectedQty.toLocaleString("vi-VN"),
    },
    {
      key: "countedQty",
      label: "Kiểm kê",
      group: "Số lượng",
      width: 110,
      align: "right",
      footer: totalCounted.toLocaleString("vi-VN"),
      renderEditor: (row, idx) => (
        <Input
          type="number"
          min={0}
          className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none focus-visible:ring-0"
          value={row.countedQty == null ? "" : String(row.countedQty)}
          onChange={(e) => {
            const next = e.target.value === "" ? null : Number(e.target.value);
            const sourceIndex = sourceIndexForVisible(idx);
            setRows((prev) =>
              prev.map((r, i) =>
                i === sourceIndex ? { ...r, countedQty: next } : r,
              ),
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
      group: "Số lượng",
      width: 100,
      type: "readonly",
      align: "right",
      footer: (totalCounted - totalExpected).toLocaleString("vi-VN"),
      getValue: (r) => {
        if (r.countedQty == null) return "—";
        const v = r.countedQty - r.expectedQty;
        return v > 0
          ? `+${v.toLocaleString("vi-VN")}`
          : v.toLocaleString("vi-VN");
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
            const sourceIndex = sourceIndexForVisible(idx);
            setRows((prev) =>
              prev.map((r, i) => (i === sourceIndex ? { ...r, reason: v } : r)),
            );
            markDirty();
          }}
          disabled={isLocked || !row.itemId}
        />
      ),
    },
    {
      key: "processAction",
      label: "Xử lý",
      width: 90,
      type: "readonly",
      getValue: (r) => {
        if (r.countedQty == null) return "Tất cả";
        const variance = r.countedQty - r.expectedQty;
        return variance > 0 ? "Nhập kho" : variance < 0 ? "Xuất kho" : "Tất cả";
      },
    },
  ];

  if (countByValue) {
    lineColumns.splice(
      7,
      0,
      {
        key: "expectedValue",
        label: "Theo sổ",
        group: "Giá trị",
        width: 100,
        type: "readonly",
        align: "right",
        footer: totalExpectedValue.toLocaleString("vi-VN"),
        getValue: (r) => r.expectedValue.toLocaleString("vi-VN"),
      },
      {
        key: "countedValue",
        label: "Kiểm kê",
        group: "Giá trị",
        width: 110,
        align: "right",
        footer: totalCountedValue.toLocaleString("vi-VN"),
        renderEditor: (row, idx) => (
          <Input
            type="number"
            min={0}
            className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none focus-visible:ring-0"
            value={row.countedValue == null ? "" : String(row.countedValue)}
            onChange={(e) => {
              const next =
                e.target.value === "" ? null : Number(e.target.value);
              const sourceIndex = sourceIndexForVisible(idx);
              setRows((prev) =>
                prev.map((r, i) =>
                  i === sourceIndex ? { ...r, countedValue: next } : r,
                ),
              );
              markDirty();
            }}
            disabled={isLocked || !row.itemId}
          />
        ),
      },
      {
        key: "valueVariance",
        label: "Chênh lệch",
        group: "Giá trị",
        width: 100,
        type: "readonly",
        align: "right",
        footer: (totalCountedValue - totalExpectedValue).toLocaleString(
          "vi-VN",
        ),
        getValue: (r) => {
          if (r.countedValue == null) return "—";
          const v = r.countedValue - r.expectedValue;
          return v > 0
            ? `+${v.toLocaleString("vi-VN")}`
            : v.toLocaleString("vi-VN");
        },
      },
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const title = isNew
    ? "Thêm mới kiểm kê kho"
    : isLocked
      ? `Phiếu kiểm kê ${stockTake?.documentNumber ?? ""}`
      : `Sửa phiếu kiểm kê ${stockTake?.documentNumber ?? ""}`;

  // MISA shows the processing outcome next to the "CHỨNG TỪ" block.
  const processStatusBadge =
    stockTake?.mergedIntoId ? (
      <span className="text-lg font-bold uppercase text-primary">ĐÃ GỘP</span>
    ) : stockTake?.status === "POSTED" ? (
      <span className="inline-flex items-center gap-2 text-lg font-bold uppercase text-green-600">
        <CheckCircle2 className="h-6 w-6 fill-green-500 text-white" /> ĐÃ XỬ LÝ
      </span>
    ) : stockTake?.status === "CANCELLED" ? (
      <span className="text-sm font-semibold text-destructive">Đã huỷ</span>
    ) : (
      <span className="text-sm font-semibold text-muted-foreground">
        Chưa xử lý
      </span>
    );

  const referenceLinks = [
    ...(refDocs.receipt
      ? [
          {
            key: `receipt-${refReceiptId}`,
            label: refDocs.receipt,
            onClick: () =>
              navigate("/inventory/purchase-orders", {
                state: { openDocumentId: refReceiptId },
              }),
          },
        ]
      : []),
    ...(refDocs.issue
      ? [
          {
            key: `issue-${refIssueId}`,
            label: refDocs.issue,
            onClick: () =>
              navigate("/inventory/goods-issues", {
                state: { openDocumentId: refIssueId },
              }),
          },
        ]
      : []),
    ...(refDocs.mergeSources ?? []).map((documentNumber, index) => ({
      key: `merge-source-${refMergeSourceIds[index] ?? documentNumber}`,
      label: documentNumber,
      onClick: () => {
        const id = refMergeSourceIds[index];
        if (id) onOpenStockTakeReference?.(id);
      },
    })),
    ...(refDocs.mergedInto
      ? [
          {
            key: `merged-into-${refMergedIntoId}`,
            label: `Gộp vào ${refDocs.mergedInto}`,
            onClick: () => {
              if (refMergedIntoId) onOpenStockTakeReference?.(refMergedIntoId);
            },
          },
        ]
      : []),
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={title}
        toolbarItems={toolbarItems}
        defaultWidth={1220}
        defaultHeight={800}
        headerContent={
          <div className="grid min-h-[220px] grid-cols-[minmax(0,1fr)_340px] gap-x-8">
            <section className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Thông tin chung
              </h3>
              <div className="space-y-2">
                <FormField
                  label="Mục đích"
                  layout="horizontal"
                  labelWidth="7rem"
                >
                  <Input
                    value={purpose}
                    onChange={(e) => {
                      setPurpose(e.target.value);
                      markDirty();
                    }}
                    disabled={isLocked}
                    className="h-10"
                  />
                </FormField>
                <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-x-5">
                  <FormField
                    label="Kho kiểm kê"
                    layout="horizontal"
                    labelWidth="7rem"
                  >
                    <Input
                      value={effectiveStorageName || effectiveStorageId}
                      disabled
                      className="h-10 bg-muted/40"
                    />
                  </FormField>
                  <FormField
                    label="Kiểm kê đến ngày"
                    layout="horizontal"
                    labelWidth="8.5rem"
                  >
                    <Input
                      type="date"
                      value={effectivePlannedDate}
                      disabled
                      className="h-10 min-w-[180px] bg-muted/40"
                    />
                  </FormField>
                </div>
                <FormField
                  label="Tham chiếu"
                  layout="horizontal"
                  labelWidth="7rem"
                >
                  <div className="flex min-h-10 flex-wrap items-center gap-y-1 text-sm">
                    {referenceLinks.length ? (
                      referenceLinks.map((reference, index) => (
                        <span key={reference.key}>
                          <button
                            type="button"
                            className="font-medium text-primary-blue hover:text-primary-blue-hover hover:underline"
                            onClick={reference.onClick}
                          >
                            {reference.label}
                          </button>
                          {index < referenceLinks.length - 1 ? (
                            <span className="mr-1 text-foreground">,</span>
                          ) : null}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </FormField>
                <FormField
                  label="Tài liệu đính kèm"
                  layout="horizontal"
                  labelWidth="7rem"
                >
                  <div className="flex min-h-10 flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10"
                      disabled={isLocked}
                      onClick={() => attachmentInputRef.current?.click()}
                    >
                      <CloudUpload className="mr-1 h-4 w-4" />
                      Tải tệp...
                    </Button>
                    {attachmentNames.length ? (
                      <span className="max-w-[360px] truncate text-xs text-muted-foreground">
                        {attachmentNames.join(", ")}
                      </span>
                    ) : null}
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        const names = Array.from(event.target.files ?? []).map(
                          (file) => file.name,
                        );
                        if (names.length) {
                          setAttachmentNames(names);
                          markDirty();
                        }
                      }}
                    />
                  </div>
                </FormField>
              </div>
            </section>
            <section className="min-w-0">
              <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Chứng từ
                </h3>
                {processStatusBadge}
              </div>
              <div className="space-y-2">
                <FormField
                  label="Số phiếu KK"
                  layout="horizontal"
                  labelWidth="7rem"
                >
                  <Input
                    value={
                      stockTake?.documentNumber ?? previewDocumentNumber ?? ""
                    }
                    disabled
                    className="h-10 bg-muted/40"
                  />
                </FormField>
                <FormField
                  label="Ngày kiểm kê"
                  layout="horizontal"
                  labelWidth="7rem"
                >
                  <Input
                    type="date"
                    value={countDate}
                    onChange={(e) => {
                      setCountDate(e.target.value);
                      markDirty();
                    }}
                    disabled={isLocked}
                    className="h-10 min-w-[190px]"
                  />
                </FormField>
                <FormField
                  label="Giờ kiểm kê"
                  layout="horizontal"
                  labelWidth="7rem"
                >
                  <Input
                    type="time"
                    value={countTime}
                    onChange={(e) => {
                      setCountTime(e.target.value);
                      markDirty();
                    }}
                    disabled={isLocked}
                    className="h-10 min-w-[190px]"
                  />
                </FormField>
              </div>
            </section>
          </div>
        }
        detail={
          <div className="flex h-full min-h-0 flex-col">
            <label className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={countByValue}
                onChange={(e) => {
                  setCountByValue(e.target.checked);
                  markDirty();
                }}
                disabled={isLocked}
              />
              Kiểm kê theo giá trị
            </label>
            <div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-2">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className={`border-b-2 px-3 py-2 text-sm font-semibold ${detailTab === "items" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                  onClick={() => setDetailTab("items")}
                >
                  Hàng hóa
                </button>
                <button
                  type="button"
                  className={`border-b-2 px-3 py-2 text-sm font-semibold ${detailTab === "members" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                  onClick={() => setDetailTab("members")}
                >
                  Thành viên tham gia
                </button>
              </div>
              {detailTab === "items" ? (
                <div className="flex items-center gap-1 text-sm">
                  <label className="flex items-center gap-1 whitespace-nowrap px-1 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={scanBarcode}
                      onChange={(e) => setScanBarcode(e.target.checked)}
                      disabled={isLocked}
                    />
                    Quét mã vạch
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isNew}
                    onClick={() => void handleExportExcel()}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Xuất khẩu
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isLocked}
                    onClick={() => importInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    Nhập khẩu
                  </Button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void handleImportFile(file);
                    }}
                  />
                </div>
              ) : null}
            </div>
            {detailTab === "items" ? (
              <div className="min-h-[190px] flex-1 overflow-hidden">
                <LineItemGrid
                  columns={lineColumns}
                  rows={visibleRows}
                  filters={filters}
                  onFilterChange={setFilters}
                  onDeleteRow={(idx) =>
                    void handleDeleteRow(sourceIndexForVisible(idx))
                  }
                  showRowActions={!isLocked}
                  showAddRow={false}
                  onAddRow={handleAddPendingRow}
                  emptyText="Tìm mã hoặc tên"
                />
              </div>
            ) : (
              <div className="min-h-[190px] flex-1 overflow-auto border-b">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="border-r px-3 py-2 text-center font-semibold">
                        Họ tên
                      </th>
                      <th className="border-r px-3 py-2 text-center font-semibold">
                        Chức danh
                      </th>
                      <th className="border-r px-3 py-2 text-center font-semibold">
                        Đại diện
                      </th>
                      <th className="w-12 border-r px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member, memberIndex) => (
                      <tr
                        key={member.id ?? `member-${memberIndex}`}
                        className="h-10 border-b bg-indigo-50/40"
                      >
                        {(["fullName", "title", "representative"] as const).map(
                          (key) => (
                            <td key={key} className="border-r p-0">
                              <Input
                                className="h-full w-full rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-1"
                                value={member[key]}
                                disabled={isLocked}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setMembers((prev) =>
                                    ensureTrailingEmptyMember(
                                      prev.map((row, index) =>
                                        index === memberIndex
                                          ? { ...row, [key]: value }
                                          : row,
                                      ),
                                      false,
                                    ),
                                  );
                                  markDirty();
                                }}
                              />
                            </td>
                          ),
                        )}
                        <td className="border-r text-center">
                          <button
                            type="button"
                            disabled={isLocked}
                            className="text-destructive/70 disabled:opacity-40"
                            onClick={() => {
                              setMembers((prev) =>
                                ensureTrailingEmptyMember(
                                  prev.filter(
                                    (_, index) => index !== memberIndex,
                                  ),
                                  false,
                                ),
                              );
                              markDirty();
                            }}
                          >
                            <Trash2 className="mx-auto h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="shrink-0 border-t bg-muted/20 px-3 py-1.5">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kết luận
              </div>
              <Textarea
                rows={1}
                value={conclusion}
                onChange={(e) => {
                  setConclusion(e.target.value);
                  markDirty();
                }}
                disabled={isLocked}
                placeholder="Nhập kết luận sau khi kiểm kê…"
                className="min-h-12 resize-none"
              />
            </div>
          </div>
        }
        footerSummary={
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs italic text-muted-foreground">
              Bấm "Xử lý" phần mềm sẽ tự động sinh phiếu nhập kho/xuất kho tương
              ứng với số lượng và giá trị hàng hóa chênh lệch thừa/thiếu sau
              kiểm kê.
            </p>
            <button
              type="button"
              onClick={() => stockTake && onRequestProcess?.(stockTake)}
              disabled={!onRequestProcess || isLocked || isNew || !stockTake}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Settings2 className="h-4 w-4" />
              Xử lý
            </button>
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
