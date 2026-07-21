import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  DocumentFormDialog,
  formatMoneyInteger,
  Input,
  LineItemGrid,
  MoneyInput,
  type LineColumn,
  type ToolbarItem,
  UnsavedChangesDialog,
  type UnsavedChangesChoice,
} from "@erp/ui";
import {
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  HelpCircle,
  PackagePlus,
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  getPreferredShelf,
  getPreferredShelfBatch,
} from "../../api/inventory-location-preferences";
import { LookupField } from "../../components/forms/LookupField";
import { CounterpartyPickerField } from "../../components/forms/CounterpartyPickerField";
import {
  QuickCreateItemDialog,
  QuickCreateIssueReasonDialog,
  QuickCreateLocationDialog,
  QuickCreateProviderDialog,
  type IssueReasonPurpose as ReasonBucket,
  type QuickIssueReason,
  type QuickItem,
  type QuickLocation,
  type QuickProvider,
} from "../../components/forms/QuickCreateDialogs";
import { ChooseWarehouseDialog } from "../../components/document/ChooseWarehouseDialog";
import {
  ensureTrailingBlankLine,
  getPersistableLines,
} from "../../pages/inventory-line-normalization";
import {
  SelectTransferOrderDialog,
  type TransferOrderDetail,
} from "../../pages/goods-issue/SelectTransferOrderDialog";
import {
  OverstockConfirmDialog,
  type OverstockWarningRow,
} from "../../pages/goods-issue/OverstockConfirmDialog";
import type { IssuableTransferOrderListItem } from "@erp/shared-interfaces";
import { DocumentLineImportDialog } from "../../pages/inventory/_components/document-import/DocumentLineImportDialog";
import type { DocumentLineImportJobRow } from "../../pages/inventory/_components/document-import/document-line-import.types";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";
import { BarcodeScanRow } from "../shared/BarcodeScanRow";
import { lookupItemByCode, type ItemLookupResult } from "../../api/item-lookup";

import {
  getActiveBranchId,
  PURPOSE_LABELS,
  MANUAL_PURPOSES,
} from "./goods-issue-shared";
import type {
  GoodsIssue,
  GoodsIssueLine,
  GoodsIssuePurposeUI,
  BranchOption,
  IssueReasonOption,
  InstantAverageCost,
  InventoryProvider,
  InventoryLocation,
  InventoryStorage,
  InventoryItem,
  PaginatedResponse,
} from "./goods-issue-shared";
import { hasPermission } from "../../lib/permissions";

/**
 * Purposes the current user is allowed to create. "Điều chuyển" (TRANSFER_OUT)
 * is always available; "Xuất khác" (OTHER) and "Hủy hàng" (DISPOSAL) are gated
 * behind their permission keys, mirroring the server check in the goods-issue
 * create path.
 */
function creatablePurposes(): GoodsIssuePurposeUI[] {
  return MANUAL_PURPOSES.filter(
    (p) =>
      p === "TRANSFER_OUT" ||
      (p === "OTHER" && hasPermission("inventory.goods-issue.other-issue")) ||
      (p === "DISPOSAL" && hasPermission("inventory.goods-issue.disposal")),
  );
}

async function getInstantAverageCost(itemId: string): Promise<number> {
  const { data } = await apiClient.get<InstantAverageCost>(
    `/inventory/stock/items/${itemId}/average-cost`,
  );
  return Number(data.unitCost ?? 0);
}

interface FormLine {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  storageId: string;
  storageLabel: string;
  locationId: string;
  locationLabel: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  itemName: "",
  unit: "",
  storageId: "",
  storageLabel: "",
  locationId: "",
  locationLabel: "",
  quantity: 1,
  unitPrice: 0,
  notes: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const normalizeFormLines = (nextLines: FormLine[]) =>
  ensureTrailingBlankLine(nextLines, emptyLine);

/** Combine a date (YYYY-MM-DD) + time (HH:MM) into an ISO timestamp. */
const combineDateTime = (date: string, time: string): string | undefined => {
  if (!date) return undefined;
  const dt = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
};

export function GoodsIssueFormDialog({
  mode,
  initial,
  customers,
  storages,
  previewDocumentNumber,
  actionLoading,
  onClose,
  onSaved,
  onEdit,
  onVoid,
  onRequestDelete,
  onProcessReceive,
}: {
  mode: "create" | "edit" | "view";
  initial: GoodsIssue | null;
  customers: InventoryProvider[];
  storages: InventoryStorage[];
  previewDocumentNumber?: string;
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onEdit: () => void;
  onVoid?: () => void;
  onRequestDelete?: () => void;
  /** "Xử lý nhập kho" — opens the receive flow for this issue's transfer. */
  onProcessReceive?: () => void;
}) {
  const navigate = useNavigate();
  const isView = mode === "view";
  const canEdit = isView && initial?.status === "DRAFT";
  // Resolve preferred shelves for many lines in a single request, then apply
  // each result back to its row. The (idx, itemId, storageId) guard prevents a
  // stale response from overwriting a row the user has since changed.
  const fillPreferredShelfBatch = (
    rows: { idx: number; itemId: string; storageId: string }[],
  ) => {
    const valid = rows.filter((r) => r.itemId && r.storageId);
    if (valid.length === 0) return;
    const pairs = [
      ...new Map(
        valid.map((r) => [
          `${r.itemId}:${r.storageId}`,
          { itemId: r.itemId, storageId: r.storageId },
        ]),
      ).values(),
    ];
    void getPreferredShelfBatch(pairs)
      .then((results) => {
        const shelfByKey = new Map(
          results.map((r) => [`${r.itemId}:${r.storageId}`, r.shelf]),
        );
        setLines((currentLines) =>
          currentLines.map((line, lineIdx) => {
            const match = valid.find(
              (r) =>
                r.idx === lineIdx &&
                line.itemId === r.itemId &&
                line.storageId === r.storageId,
            );
            if (!match) return line;
            const shelf = shelfByKey.get(`${match.itemId}:${match.storageId}`);
            if (!shelf) return line;
            return { ...line, locationId: shelf.id, locationLabel: shelf.code };
          }),
        );
      })
      .catch(() => {});
  };

  const fillPreferredShelf = (idx: number, itemId: string, storageId: string) =>
    fillPreferredShelfBatch([{ idx, itemId, storageId }]);

  // Resolve the eager-loaded provider first, then fall back to a customer lookup
  // for legacy rows that pre-date the provider column.
  const initialCustomer = useMemo(() => {
    if (!initial) return { id: "", code: "", name: "" };
    // Prefer the resolved counterparty — the only source of a name for customer
    // / employee đối tượng (those have no provider and aren't in `customers`).
    if (initial.counterparty)
      return {
        id: initial.counterparty.id,
        code: initial.counterparty.code ?? "",
        name: initial.counterparty.name,
      };
    if (initial.provider) {
      return {
        id: initial.provider.id,
        code: initial.provider.code,
        name: initial.provider.name,
      };
    }
    if (initial.providerId) {
      const c = customers.find((x) => x.id === initial.providerId);
      return c
        ? { id: c.id, code: c.code, name: c.name }
        : { id: initial.providerId, code: "", name: "" };
    }
    if (initial.customerName) {
      const c = customers.find((x) => x.id === initial.customerId);
      return {
        id: initial.customerId ?? "",
        code: c?.code ?? "",
        name: initial.customerName,
      };
    }
    const c = customers.find((x) => x.id === initial.customerId);
    return c
      ? { id: c.id, code: c.code, name: c.name }
      : { id: "", code: "", name: "" };
  }, [initial, customers]);

  const [customerId, setCustomerId] = useState(initialCustomer.id);
  const [customerCode, setCustomerCode] = useState(initialCustomer.code);
  const [customerName, setCustomerName] = useState(initialCustomer.name);
  // Đối tượng kind for the new counterparty routing. Rehydrate from the saved
  // doc so re-saving an edited phiếu keeps its kind; legacy provider rows
  // without a kind are treated as suppliers.
  const [counterpartyKind, setCounterpartyKind] = useState<
    "supplier" | "customer" | "employee" | ""
  >(initial?.counterpartyKind ?? (initial?.providerId ? "supplier" : ""));
  // Storage derived from the saved location's parent. Cached storages let us
  // resolve a name immediately on open; the picker will reset both if user
  // changes warehouse later. For a new (create) phiếu, default to the active
  // branch's default receiving storage; fall back to the main storage, then the
  // first kho.
  const defaultStorage = useMemo(
    () =>
      storages.find((s) => s.isDefaultReceiving) ??
      storages.find((s) => s.isMainStorage) ??
      storages[0],
    [storages],
  );

  const initialStorageId =
    initial?.location?.storageId ?? (initial ? "" : defaultStorage?.id ?? "");
  const initialStorageName = initialStorageId
    ? storages.find((s) => s.id === initialStorageId)?.name ?? ""
    : "";
  const [storageId, setStorageId] = useState(initialStorageId);
  const [storageQuery, setStorageQuery] = useState(initialStorageName);
  const [purpose, setPurpose] = useState<GoodsIssuePurposeUI>(() =>
    initial?.purpose && MANUAL_PURPOSES.includes(initial.purpose)
      ? initial.purpose
      : creatablePurposes()[0] ?? "TRANSFER_OUT",
  );
  // Options shown in the purpose dropdown: the creatable set, plus the current
  // purpose when viewing/editing an issue whose purpose the user can't create,
  // so the <select> never holds an out-of-range value.
  const visiblePurposes = useMemo<GoodsIssuePurposeUI[]>(() => {
    const allowed = creatablePurposes();
    return allowed.includes(purpose) ? allowed : [...allowed, purpose];
  }, [purpose]);
  const [reasonId, setReasonId] = useState(initial?.reasonId ?? "");
  const [reasonLabel, setReasonLabel] = useState(
    initial?.reasonId ? initial?.reason ?? "" : "",
  );
  const [targetBranchId, setTargetBranchId] = useState(initial?.targetBranchId ?? "");
  const [targetBranchLabel, setTargetBranchLabel] = useState(
    initial?.targetBranch?.name ?? "",
  );
  const [deliveryPerson, setDeliveryPerson] = useState(initial?.deliverer ?? "");
  const [references, setReferences] = useState<string[]>(initial?.references ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const notesAutoFilledRef = useRef(false);
  // Ngày/Giờ xuất come from the persisted occurredAt; fall back to now for a
  // fresh form (or legacy rows where occurredAt is null).
  const initialOccurred = initial?.occurredAt ? new Date(initial.occurredAt) : null;
  const [docDate, setDocDate] = useState(
    initialOccurred
      ? `${initialOccurred.getFullYear()}-${String(initialOccurred.getMonth() + 1).padStart(2, "0")}-${String(initialOccurred.getDate()).padStart(2, "0")}`
      : initial?.issueDate ?? new Date().toISOString().slice(0, 10),
  );
  const [docTime, setDocTime] = useState(() => {
    const d = initialOccurred ?? new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [emptyLine()];

    const initialLines = initial.lines.map((l) => ({
          itemId: l.itemId,
          // Prefer the eager-loaded item code; fall back to the legacy
          // flat itemCode field or a short id slice as last resort.
          itemLabel: l.item?.code ?? l.itemCode ?? l.itemId.slice(0, 8),
          itemName: l.item?.name ?? l.itemName ?? "",
          unit: l.item?.unit ?? l.unit ?? "",
          // Each line carries its own warehouse + bin (Misa parity).
          locationId: l.locationId ?? "",
          locationLabel: l.location?.code ?? "",
          storageId: l.location?.storageId ?? "",
          storageLabel:
            storages.find((s) => s.id === l.location?.storageId)?.name ?? "",
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice ?? 0),
          notes: l.notes ?? "",
        }));

    return isView ? initialLines : normalizeFormLines(initialLines);
  });

  const [barcodeMode, setBarcodeMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [overstockWarnings, setOverstockWarnings] = useState<
    OverstockWarningRow[] | null
  >(null);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [chooseKhoOpen, setChooseKhoOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** Line index that triggered the quick-create-location dialog, or null. */
  const [quickLocationLineIdx, setQuickLocationLineIdx] = useState<number | null>(null);
  const [quickItemLineIdx, setQuickItemLineIdx] = useState<number | null>(null);
  const [quickReasonBucket, setQuickReasonBucket] = useState<ReasonBucket | null>(
    null,
  );
  const [storageCache, setStorageCache] = useState<
    Array<{ id: string; name: string; branchId: string }>
  >([]);

  // "Tham chiếu": phiếu xuất kho kiểm kê được sinh tự động khi "Xử lý" một phiếu
  // kiểm kê. API chỉ trả referenceId — resolve số phiếu KK gốc để hiển thị.
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  // "Lập từ lệnh điều chuyển": when set, this form represents the export leg of a
  // transfer order — Save calls the transfer export endpoint instead of creating
  // a standalone goods issue.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceTransferOrderId, setSourceTransferOrderId] = useState<string | null>(
    null,
  );
  const referenceStockTakeId =
    initial?.referenceType === "STOCK_TAKE" ? initial.referenceId ?? null : null;
  useEffect(() => {
    if (!referenceStockTakeId) {
      setReferenceNumber(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ documentNumber?: string }>(
          `/inventory/stock-takes/${referenceStockTakeId}`,
        );
        if (!cancelled) setReferenceNumber(data.documentNumber ?? null);
      } catch {
        // best-effort — tham chiếu chỉ mang tính thông tin
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referenceStockTakeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const branchId = getActiveBranchId();
        const params = new URLSearchParams({ page: "1", pageSize: "200" });
        if (branchId) params.set("branchId", branchId);
        params.set("activeOnly", "true");
        const { data } = await apiClient.get<
          PaginatedResponse<{ id: string; name: string; branchId: string }>
        >(`/inventory/storages?${params}`);
        if (!cancelled) setStorageCache(data.data);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const handleApplyDraftImport = useCallback(
    (importedRows: DocumentLineImportJobRow[]) => {
      const mapped = importedRows.flatMap((row) => {
        const normalized = row.normalizedData;
        if (!normalized) return [];
        return [
          {
            itemId: normalized.itemId,
            itemLabel: normalized.itemCode,
            itemName: normalized.itemName,
            unit: normalized.unit,
            storageId: normalized.storageId ?? "",
            storageLabel: normalized.storageName ?? "",
            locationId: normalized.locationId ?? "",
            locationLabel: normalized.locationCode ?? "",
            quantity: normalized.quantity,
            unitPrice: Number(normalized.unitPrice ?? 0),
            notes: normalized.note,
          },
        ];
      });
      setLines(normalizeFormLines(mapped));
      if (mapped[0]?.storageId) {
        setStorageId(mapped[0].storageId);
        setStorageQuery(mapped[0].storageLabel);
      }
      setDirty(true);
    },
    [],
  );

  const handlePurposeChange = (next: GoodsIssuePurposeUI) => {
    if (next === purpose) return;
    setPurpose(next);
    setReasonId("");
    setReasonLabel("");
    setTargetBranchId("");
    setTargetBranchLabel("");
    if (notesAutoFilledRef.current) {
      setNotes("");
      notesAutoFilledRef.current = false;
    }
    markDirty();
  };

  /** Load a picked transfer order into the form as the export leg. */
  const prefillFromTransferOrder = useCallback(
    (detail: TransferOrderDetail, row: IssuableTransferOrderListItem) => {
      setPurpose("TRANSFER_OUT");
      setReasonId("");
      setReasonLabel("");
      setTargetBranchId(detail.destinationBranchId);
      setTargetBranchLabel(row.destinationBranchName);
      const ldc = detail.documentNumber ?? row.documentNumber;
      setReferenceNumber(ldc);
      setReferences(ldc ? [ldc] : []);
      setSourceTransferOrderId(detail.id);
      const autoNotes =
        detail.notes ||
        `Xuất kho hàng hóa điều chuyển đến cửa hàng ${row.destinationBranchName}`;
      setNotes(autoNotes);
      notesAutoFilledRef.current = true;
      // The detail grid is locked for transfer-sourced issues — the user can't
      // pick a bin — so the Vị trí must come pre-resolved from the order. The
      // backend resolves each line's source bin from the product's assigned
      // location in the source storage ("Xếp vị trí"), the bin posting enforces.
      const mapped: FormLine[] = detail.lines.map((l) => {
        const storageId = l.sourceStorageId ?? detail.sourceStorageId ?? "";
        const storageLabel = storageId
          ? storages.find((s) => s.id === storageId)?.name ?? ""
          : "";
        return {
          itemId: l.itemId,
          itemLabel: l.item?.code ?? "",
          itemName: l.item?.name ?? "",
          unit: l.item?.unit ?? "",
          storageId,
          storageLabel,
          locationId: l.sourceLocationId ?? "",
          locationLabel: l.sourceLocationCode ?? "",
          quantity: Number(l.requestedQty),
          unitPrice: Number(l.item?.purchasePrice ?? 0),
          notes: l.note ?? "",
        };
      });
      // No trailing blank line — the locked detail must not render an empty row.
      setLines(mapped);
      setDirty(true);
    },
    [storages],
  );

  /** Unlink the transfer order — the form reverts to a plain goods issue. */
  const clearTransferSource = () => {
    setSourceTransferOrderId(null);
    setReferenceNumber(null);
    setReferences([]);
    markDirty();
  };

  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      const active = storages.filter((s) => s.isActive !== false);
      const filtered = q
        ? active.filter((s) => s.name.toLowerCase().includes(q))
        : active;
      const effectivePageSize = pageSize ?? 8;
      const start = (page - 1) * effectivePageSize;
      const items = filtered.slice(start, start + effectivePageSize);
      return {
        items,
        hasMore: start + effectivePageSize < filtered.length,
        total: filtered.length,
      };
    },
    [storages],
  );

  const searchLocationsForStorage = useCallback(
    async (storageIdArg: string, query: string, page: number, pageSize?: number) => {
      if (!storageIdArg) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
        storageId: storageIdArg,
        activeOnly: "true",
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 10;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
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

  const searchBranches = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 8;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<PaginatedResponse<BranchOption>>(
        `/branches?${params}`,
      );
      const activeBranchId = getActiveBranchId();
      const items = activeBranchId
        ? data.data.filter((branch) => branch.id !== activeBranchId)
        : data.data;
      const fetched = data.page * data.pageSize;
      return {
        items,
        hasMore: fetched < data.total,
        total: Math.max(
          0,
          data.total - (items.length < data.data.length ? 1 : 0),
        ),
      };
    },
    [],
  );

  const reasonBucket: ReasonBucket | null =
    purpose === "OTHER" ? "OTHER" : purpose === "DISPOSAL" ? "DISPOSAL" : null;

  const searchReasons = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      if (!reasonBucket) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        purpose: reasonBucket,
        activeOnly: "true",
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<PaginatedResponse<IssueReasonOption>>(
        `/inventory/issue-reasons?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [reasonBucket],
  );

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const totalAmount = summaryLines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0),
    0,
  );

  const handleSave = useCallback(async (skipOverstockConfirm = false): Promise<boolean> => {
    // Toasts (not modal) — same reason as goods-receipt: AppModal validation
    // dialogs got stacked under the unsaved-changes confirm and disappeared.
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng hàng hợp lệ.");
      return false;
    }
    if (persistableLines.some((l) => !l.storageId)) {
      toast.error("Mỗi dòng hàng phải chọn kho.");
      return false;
    }
    if (purpose === "TRANSFER_OUT" && !targetBranchId) {
      toast.error("Vui lòng chọn cửa hàng đích để điều chuyển.");
      return false;
    }
    setSaving(true);
    try {
      // Resolve a fallback bin per warehouse for lines the user left empty.
      const fallbackByStorage = new Map<string, string>();
      const resolvedLines: typeof persistableLines = [];
      for (const l of persistableLines) {
        let locationId = l.locationId;
        if (!locationId) {
          const preferred = await getPreferredShelf(l.itemId, l.storageId).catch(
            () => null,
          );
          if (preferred) {
            locationId = preferred.id;
          }
        }
        if (!locationId) {
          let fb = fallbackByStorage.get(l.storageId);
          if (fb === undefined) {
            const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
              `/inventory/locations?page=1&pageSize=50&storageId=${encodeURIComponent(l.storageId)}&includeUnassigned=true&activeOnly=true`,
            );
            const first =
              data.data.find((loc) => loc.isUnassigned === true) ??
              data.data.find((loc) => loc.code === "__UNASSIGNED__") ??
              data.data[0];
            if (!first) {
              toast.error("Có kho chưa có vị trí nào. Vui lòng tạo ít nhất 1 vị trí trước.");
              setSaving(false);
              return false;
            }
            fb = first.id;
            fallbackByStorage.set(l.storageId, fb);
          }
          locationId = fb;
        }
        resolvedLines.push({ ...l, locationId });
      }
      const headerLocationId = resolvedLines[0]?.locationId ?? "";
      const issueLines = resolvedLines.map((l) => ({
        itemId: l.itemId,
        locationId: l.locationId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
        notes: l.notes || undefined,
      }));

      if (!skipOverstockConfirm) {
        const requestedByStockKey = new Map<
          string,
          { line: (typeof resolvedLines)[number]; quantity: number }
        >();
        for (const line of resolvedLines) {
          const key = `${line.itemId}:${line.locationId}`;
          const current = requestedByStockKey.get(key);
          requestedByStockKey.set(key, {
            line,
            quantity: (current?.quantity ?? 0) + Number(line.quantity),
          });
        }

        const warnings = (
          await Promise.all(
            [...requestedByStockKey.values()].map(async ({ line, quantity }) => {
              const params = new URLSearchParams({
                page: "1",
                pageSize: "1",
                itemId: line.itemId,
                locationId: line.locationId,
              });
              const { data } = await apiClient.get<
                PaginatedResponse<{ quantity: number | string }>
              >(`/inventory/stock/balances?${params}`);
              const availableQuantity = Number(data.data[0]?.quantity ?? 0);
              if (quantity <= availableQuantity) return null;
              return {
                itemId: line.itemId,
                itemName: line.itemName || line.itemLabel,
                availableQuantity,
                unit: line.unit,
                storageName: line.storageLabel,
              } satisfies OverstockWarningRow;
            }),
          )
        ).filter((row): row is OverstockWarningRow => row !== null);

        if (warnings.length > 0) {
          setOverstockWarnings(warnings);
          return false;
        }
      }

      if (sourceTransferOrderId) {
        // Saving the export leg of a transfer order: this posts the goods issue
        // and advances the transfer order DRAFT → IN_PROGRESS server-side. Carry
        // the form's header fields so the spawned issue round-trips them too.
        await apiClient.post(
          `/inventory/transfer-orders/${sourceTransferOrderId}/export`,
          {
            notes: notes || undefined,
            providerId:
              counterpartyKind === "supplier" ? customerId || undefined : undefined,
            counterpartyKind: counterpartyKind || undefined,
            counterpartyId: customerId || undefined,
            deliverer: deliveryPerson || undefined,
            references: references.length ? references : undefined,
            occurredAt: combineDateTime(docDate, docTime),
            lines: issueLines,
          },
        );
      } else if (purpose === "TRANSFER_OUT") {
        await apiClient.post("/inventory/transfer-orders/direct-export", {
          locationId: headerLocationId,
          targetBranchId,
          providerId:
            counterpartyKind === "supplier" ? customerId || undefined : undefined,
          counterpartyKind: counterpartyKind || undefined,
          counterpartyId: customerId || undefined,
          notes: notes || undefined,
          deliverer: deliveryPerson || undefined,
          references: references.length ? references : undefined,
          occurredAt: combineDateTime(docDate, docTime),
          lines: issueLines,
        });
      } else {
        await apiClient.post("/inventory/goods-issues", {
          locationId: headerLocationId,
          counterpartyKind: counterpartyKind || undefined,
          counterpartyId: customerId || undefined,
          purpose,
          reasonId:
            (purpose === "OTHER" || purpose === "DISPOSAL") && reasonId
              ? reasonId
              : undefined,
          notes: notes || undefined,
          deliverer: deliveryPerson || undefined,
          references: references.length ? references : undefined,
          occurredAt: combineDateTime(docDate, docTime),
          lines: issueLines,
        });
      }
      setDirty(false);
      // "Lưu" tạo + thực hiện luôn (giống MISA): phiếu trả về đã ở trạng thái
      // đã xuất kho, đã ghi sổ tồn kho.
      toast.success("Đã xuất kho.");
      await onSaved();
      return true;
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    customerId,
    counterpartyKind,
    lines,
    notes,
    deliveryPerson,
    references,
    docDate,
    docTime,
    purpose,
    reasonId,
    targetBranchId,
    sourceTransferOrderId,
    onSaved,
  ]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    // UnsavedChangesDialog closes itself via onOpenChange. We only decide
    // whether to close the parent form: yes on a successful save/discard,
    // no when save failed (validation toast already shown).
    if (choice === "save") {
      const ok = await handleSave();
      if (ok) onClose();
    } else if (choice === "discard") {
      onClose();
    }
  };

  const dialogToolbar: ToolbarItem[] = [
    { id: "prev", label: "Trước", icon: ChevronLeft, disabled: true, onClick: () => {} },
    { id: "next", label: "Sau", icon: ChevronRight, disabled: true, onClick: () => {} },
    { id: "sep1", type: "separator" },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !canEdit,
      onClick: onEdit,
    },
    {
      id: "save",
      label: "Lưu",
      icon: Save,
      disabled: isView || saving,
      onClick: () => void handleSave(),
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !onRequestDelete,
      onClick: () => onRequestDelete?.(),
    },
    {
      id: "void",
      label: "Hoãn",
      icon: RotateCcw,
      disabled: true,
      onClick: () => onVoid?.(),
    },
    ...(mode === "create"
      ? [
          {
            id: "utilities",
            label: "Tiện ích",
            icon: Wrench,
            onClick: () => {},
            options: [
              {
                id: "from-transfer",
                label: "Lập từ lệnh điều chuyển",
                onClick: () => setPickerOpen(true),
              },
            ],
          } as ToolbarItem,
        ]
      : []),
    { id: "sep2", type: "separator" },
    { id: "print", label: "In", icon: Printer, disabled: true, onClick: () => {} },
    { id: "export", label: "Xuất khẩu", icon: CloudUpload, disabled: true, onClick: () => {} },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  // Lines sourced from a transfer order mirror the order exactly — lock the
  // whole detail (add/delete row + every cell). View mode is read-only too.
  const detailLocked = isView || sourceTransferOrderId !== null;

  // Multi-select product picker → append one line per chosen item (dedupe by itemId),
  // pre-filling Số lượng/Đơn giá from the dialog and the warehouse from "Chọn kho"/default.
  // Lines without an explicit price get the instant average cost (mirrors single-select onSelect).
  const addLinesFromPicker = (result: ProductSelectResult) => {
    const existing = new Set(lines.map((l) => l.itemId).filter(Boolean));
    const fallbackStorageId = storageId || defaultStorage?.id || "";
    const fallbackStorageLabel = storageQuery || defaultStorage?.name || "";
    const fresh: FormLine[] = result.lines
      .filter((s) => s.itemId && !existing.has(s.itemId))
      .map((s) => ({
        itemId: s.itemId,
        itemLabel: s.sku,
        itemName: s.name,
        unit: s.unit,
        storageId: fallbackStorageId,
        storageLabel: fallbackStorageLabel,
        locationId: "",
        locationLabel: "",
        quantity: s.quantity > 0 ? s.quantity : 1,
        unitPrice: s.unitPrice > 0 ? s.unitPrice : 0,
        notes: "",
      }));
    if (fresh.length === 0) return;
    const base = getPersistableFormLines(lines);
    const startIdx = base.length;
    setLines(normalizeFormLines([...base, ...fresh]));
    markDirty();
    fillPreferredShelfBatch(
      fresh.map((line, i) => ({
        idx: startIdx + i,
        itemId: line.itemId,
        storageId: line.storageId,
      })),
    );
    fresh.forEach((line, i) => {
      const idx = startIdx + i;
      if (line.itemId && line.unitPrice <= 0) {
        void getInstantAverageCost(line.itemId)
          .then((unitCost) => {
            setLines((current) =>
              current.map((l, i2) =>
                i2 === idx && l.itemId === line.itemId && !(l.unitPrice > 0)
                  ? { ...l, unitPrice: unitCost }
                  : l,
              ),
            );
          })
          .catch(() => {});
      }
    });
  };

  // The scanner resolves one item: accumulate if the item already has a line, otherwise
  // add a new line then auto-fill the preferred shelf + instant weighted-average cost — matching
  // addLinesFromPicker exactly so a scanned line is no different from one picked from the picker.
  const handleScanResolved = (item: ItemLookupResult, qty: number) => {
    const existingIdx = lines.findIndex((l) => l.itemId === item.itemId);
    if (existingIdx >= 0) {
      setLines((prev) =>
        prev.map((l, i) =>
          i === existingIdx ? { ...l, quantity: (l.quantity || 0) + qty } : l,
        ),
      );
      markDirty();
      return;
    }
    const fallbackStorageId = storageId || defaultStorage?.id || "";
    const fallbackStorageLabel = storageQuery || defaultStorage?.name || "";
    const newLine: FormLine = {
      itemId: item.itemId,
      itemLabel: item.code,
      itemName: item.name,
      unit: item.unit,
      storageId: fallbackStorageId,
      storageLabel: fallbackStorageLabel,
      locationId: "",
      locationLabel: "",
      quantity: qty > 0 ? qty : 1,
      unitPrice: 0,
      notes: "",
    };
    const base = getPersistableFormLines(lines);
    const startIdx = base.length;
    setLines(normalizeFormLines([...base, newLine]));
    markDirty();
    fillPreferredShelfBatch([
      { idx: startIdx, itemId: newLine.itemId, storageId: newLine.storageId },
    ]);
    if (newLine.itemId && newLine.unitPrice <= 0) {
      void getInstantAverageCost(newLine.itemId)
        .then((unitCost) => {
          setLines((current) =>
            current.map((l, i2) =>
              i2 === startIdx &&
              l.itemId === newLine.itemId &&
              !(l.unitPrice > 0)
                ? { ...l, unitPrice: unitCost }
                : l,
            ),
          );
        })
        .catch(() => {});
    }
  };

  // Fill the line at `idx` from a selected item — shared by the inline
  // typeahead (onSelect) and the single-fill ProductSelectDialog.
  const fillLineFromItem = (
    idx: number,
    item: {
      id: string;
      code: string;
      name: string;
      unit: string;
      purchasePrice?: number | string | null;
    },
  ) => {
    const defaultUnitPrice = Number(item.purchasePrice ?? 0) || 0;
    let selectedStorageId = "";
    let selectedStorageLabel = "";
    setLines((prev) => {
      const updated = prev.map((l, i) => {
        if (i !== idx) return l;
        selectedStorageId = l.storageId;
        selectedStorageLabel = l.storageLabel;
        if (!selectedStorageId) {
          for (let j = i - 1; j >= 0; j--) {
            if (prev[j].storageId) {
              selectedStorageId = prev[j].storageId;
              selectedStorageLabel = prev[j].storageLabel;
              break;
            }
          }
        }
        if (!selectedStorageId) {
          selectedStorageId = storageId;
          selectedStorageLabel = storageQuery;
        }
        return {
          ...l,
          itemId: item.id,
          itemLabel: item.code,
          itemName: item.name,
          unit: item.unit,
          storageId: selectedStorageId,
          storageLabel: selectedStorageLabel,
          locationId: "",
          locationLabel: "",
          unitPrice: defaultUnitPrice,
        };
      });

      if (selectedStorageId) {
        fillPreferredShelf(idx, item.id, selectedStorageId);
      }

      return normalizeFormLines(updated);
    });
    void getInstantAverageCost(item.id)
      .then((unitCost) => {
        setLines((current) =>
          current.map((line, lineIdx) =>
            lineIdx === idx && line.itemId === item.id
              ? { ...line, unitPrice: unitCost }
              : line,
          ),
        );
      })
      .catch(() => {
        // Keep purchase price fallback already shown in the row.
      });
    markDirty();
  };

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 360,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <div className="flex h-full items-center gap-1">
        <LookupField
          portalToBody
          onSearchButtonClick={() => setProductPickerOpen(true)}
          dropdownMinWidth={520}
          placeholder="Tìm mã hoặc tên"
          value={row.itemLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      itemLabel: val,
                      itemName: "",
                      itemId: "",
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(item) => fillLineFromItem(idx, item)}
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
            { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
            { key: "unit", label: "ĐVT", className: "w-[80px]", render: (it) => it.unit },
          ]}
          disabled={detailLocked}
          onCreateNew={detailLocked ? undefined : () => setQuickItemLineIdx(idx)}
          className="h-full flex-1"
        />
        </div>
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 280,
      type: "readonly",
      getValue: (row) => row.itemName,
    },
    {
      key: "warehouse",
      label: "Kho",
      width: 220,
      placeholder: "Chọn kho",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn kho"
          searchModalPlaceholder="Nhập tên kho"
          dropdownMinWidth={320}
          placeholder="Chọn kho"
          value={row.storageLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      storageLabel: val,
                      storageId: "",
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(s) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      storageId: s.id,
                      storageLabel: s.name,
                      // A bin belongs to one warehouse — clear it when the
                      // line's warehouse changes.
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            if (row.itemId) {
              fillPreferredShelf(idx, row.itemId, s.id);
            }
            markDirty();
          }}
          search={searchStorages}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={() => ""}
          columns={[{ key: "name", label: "Tên kho", render: (s) => s.name }]}
          disabled={detailLocked}
          className="h-full"
        />
      ),
    },
    {
      key: "position",
      label: "Vị trí",
      width: 220,
      placeholder: "Chọn vị trí",
      renderEditor: (row, idx) => (
        <LookupField<InventoryLocation>
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn vị trí"
          searchModalPlaceholder="Nhập mã hoặc tên vị trí"
          dropdownMinWidth={360}
          placeholder={row.storageId ? "Chọn vị trí" : "Chọn kho trước"}
          value={row.locationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, locationLabel: val, locationId: "" } : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, locationId: loc.id, locationLabel: loc.code }
                  : l,
              ),
            );
            markDirty();
          }}
          search={(q, p, ps) => searchLocationsForStorage(row.storageId, q, p, ps)}
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (l) => l.code },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={detailLocked || !row.storageId}
          onCreateNew={
            detailLocked || !row.storageId
              ? undefined
              : () => setQuickLocationLineIdx(idx)
          }
          className="h-full"
        />
      ),
    },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 100,
      type: "readonly",
      getValue: (r) => r.unit || "Đôi",
    },
    {
      key: "quantity",
      label: "Số lượng",
      width: 110,
      type: "number",
      align: "right",
      filterSymbol: "≤",
      footer: totalQty.toLocaleString("vi-VN"),
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 140,
      align: "right",
      filterSymbol: "≤",
      renderEditor: (row, idx) => (
        <MoneyInput
          disabled={detailLocked}
          className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none"
          value={row.unitPrice === 0 ? "" : row.unitPrice}
          onChange={(v) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, unitPrice: v === "" ? 0 : Number(v) } : l,
              ),
            );
            markDirty();
          }}
        />
      ),
    },
    {
      key: "lineTotal",
      label: "Thành tiền",
      width: 150,
      type: "readonly",
      align: "right",
      filterSymbol: "≤",
      getValue: (r) =>
        r.itemId ? formatMoneyInteger(Number(r.quantity) * Number(r.unitPrice)) : "",
      footer: formatMoneyInteger(totalAmount),
    },
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={
          mode === "create"
            ? "Thêm mới phiếu xuất kho"
            : `Phiếu xuất kho ${initial?.documentNumber ?? ""}`
        }
        toolbarItems={dialogToolbar}
        purpose={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-muted-foreground">Mục đích xuất kho</span>
            <select
              className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={purpose}
              onChange={(e) =>
                handlePurposeChange(e.target.value as GoodsIssuePurposeUI)
              }
              disabled={isView || sourceTransferOrderId !== null}
            >
              {visiblePurposes.map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABELS[p]}
                </option>
              ))}
            </select>

            {reasonBucket ? (
              <div className="min-w-[220px] flex-1">
                <LookupField
                  enableSearchModal
                  searchModalTitle="Chọn lý do xuất kho"
                  searchModalPlaceholder="Nhập mã hoặc tên lý do"
                  placeholder="Nhập để tìm kiếm"
                  value={reasonLabel}
                  onValueChange={(v) => {
                    setReasonLabel(v);
                    setReasonId("");
                    markDirty();
                  }}
                  onSelect={(r) => {
                    setReasonId(r.id);
                    setReasonLabel(r.name);
                    markDirty();
                  }}
                  search={searchReasons}
                  itemKey={(r) => r.id}
                  renderItem={(r) => r.name}
                  renderMeta={(r) => r.code}
                  columns={[
                    { key: "name", label: "Lý do", render: (r) => r.name },
                    {
                      key: "code",
                      label: "Mã",
                      className: "w-[140px] font-mono text-xs",
                      render: (r) => r.code,
                    },
                  ]}
                  disabled={isView}
                  onCreateNew={
                    isView ? undefined : () => setQuickReasonBucket(reasonBucket)
                  }
                />
              </div>
            ) : null}

            {purpose === "TRANSFER_OUT" ? (
              <div className="min-w-[320px] flex-1">
                <LookupField
                  enableSearchModal
                  searchModalTitle="Chọn cửa hàng đích"
                  searchModalPlaceholder="Nhập tên cửa hàng"
                  placeholder="Chọn cửa hàng đích"
                  value={targetBranchLabel}
                  onValueChange={(v) => {
                    setTargetBranchLabel(v);
                    setTargetBranchId("");
                  }}
                  onSelect={(b) => {
                    setTargetBranchId(b.id);
                    setTargetBranchLabel(b.name);
                    const autoNotes = `Xuất kho hàng hóa điều chuyển đến cửa hàng ${b.name}`;
                    setNotes(autoNotes);
                    notesAutoFilledRef.current = true;
                    markDirty();
                  }}
                  search={searchBranches}
                  itemKey={(b) => b.id}
                  renderItem={(b) => b.name}
                  renderMeta={(b) => b.address ?? ""}
                  columns={[
                    { key: "name", label: "Tên cửa hàng", render: (b) => b.name },
                    { key: "address", label: "Địa chỉ", render: (b) => b.address ?? "—" },
                  ]}
                  disabled={isView}
                />
              </div>
            ) : null}
          </div>
        }
        generalInfo={
          <>
            <FieldRow label="Đối tượng">
              <div className="flex items-stretch gap-2">
                <CounterpartyPickerField
                  defaultType="customer"
                  allowedTypes={["supplier", "customer", "employee"]}
                  className="w-[180px]"
                  dropdownMinWidth={500}
                  modalTitle="Chọn đối tượng"
                  modalPlaceholder="Nhập mã hoặc tên đối tượng"
                  value={customerCode}
                  onValueChange={(v) => {
                    setCustomerCode(v);
                    setCustomerId("");
                    setCustomerName("");
                    setCounterpartyKind("");
                    markDirty();
                  }}
                  onSelect={(c) => {
                    setCustomerId(c.id);
                    setCustomerCode(c.code ?? "");
                    setCustomerName(c.name);
                    setCounterpartyKind(c.kind);
                    markDirty();
                  }}
                  disabled={isView}
                  onCreateNew={isView ? undefined : () => setQuickCustomerOpen(true)}
                />
                <Input
                  className="flex-1"
                  placeholder="Tên đối tượng"
                  value={customerName}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </FieldRow>
            <FieldRow label="Người giao">
              <Input
                value={deliveryPerson}
                onChange={(e) => {
                  setDeliveryPerson(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Diễn giải">
              <Input
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  notesAutoFilledRef.current = false;
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Tham chiếu">
              {(() => {
                // FE-supplied reference list, plus any resolved single-doc
                // linkage (stock-take / transfer order) not already in it.
                const refs = [
                  ...references,
                  ...(referenceNumber && !references.includes(referenceNumber)
                    ? [referenceNumber]
                    : []),
                ];
                return refs.length ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {refs.map((r) =>
                      r === referenceNumber && referenceStockTakeId ? (
                        <button
                          key={r}
                          type="button"
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium text-primary-blue hover:text-primary-blue-hover hover:underline"
                          onClick={() =>
                            navigate("/inventory/stock-takes", {
                              state: { openDocumentId: referenceStockTakeId },
                            })
                          }
                        >
                          {r}
                        </button>
                      ) : (
                        <span
                          key={r}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium text-foreground"
                        >
                          {r}
                        </span>
                      ),
                    )}
                    {sourceTransferOrderId && !isView ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-destructive hover:underline"
                        title="Gỡ liên kết lệnh điều chuyển"
                        onClick={clearTransferSource}
                      >
                        (x)
                      </button>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                );
              })()}
            </FieldRow>
            <FieldRow label="Tài liệu đính kèm">
              <Button type="button" variant="outline" size="sm" disabled>
                Tải tệp …
              </Button>
            </FieldRow>
          </>
        }
        documentInfo={
          <>
            <FieldRow label="Số phiếu xuất">
              <Input
                value={initial?.documentNumber ?? previewDocumentNumber ?? ""}
                readOnly
                title={
                  initial?.documentNumber
                    ? undefined
                    : "Số dự kiến — hệ thống sẽ chốt khi lưu"
                }
              />
            </FieldRow>
            <FieldRow label="Ngày xuất">
              <Input
                type="date"
                value={docDate}
                onChange={(e) => {
                  setDocDate(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Giờ xuất">
              <Input
                type="time"
                value={docTime}
                onChange={(e) => {
                  setDocTime(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
          </>
        }
        detailActions={
          detailLocked ? undefined : (
            <>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={barcodeMode}
                  onChange={(e) => setBarcodeMode(e.target.checked)}
                />
                <span>Quét mã vạch</span>
              </label>
              <button
                type="button"
                className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover"
                onClick={() => setChooseKhoOpen(true)}
              >
                Chọn kho
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover"
                disabled={saving}
                onClick={() => setImportOpen(true)}
              >
                Nhập khẩu
              </button>
            </>
          )
        }
        detail={
          <>
            {/* Barcode-scan row above the line grid, toggled by the checkbox in detailActions. */}
            {barcodeMode && (
              <BarcodeScanRow
                lookup={lookupItemByCode}
                onResolved={handleScanResolved}
                getSku={(i) => i.code}
                getName={(i) => i.name}
                disabled={detailLocked}
              />
            )}
            <LineItemGrid
              columns={lineColumns}
              // Omitting onChangeCell makes the built-in cells (Số lượng) read-only.
              onChangeCell={
                detailLocked
                  ? undefined
                  : (idx, key, value) => {
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
                      );
                      markDirty();
                    }
              }
              rows={lines}
              onAddRow={() => {
                setLines((prev) => normalizeFormLines([...prev, emptyLine()]));
                markDirty();
              }}
              onDeleteRow={(idx) => {
                setLines((prev) =>
                  normalizeFormLines(prev.filter((_, i) => i !== idx)),
                );
                markDirty();
              }}
              showAddRow={!detailLocked}
              showRowActions={!detailLocked}
            />
          </>
        }
        footerSummary={
          <div className="flex items-center justify-between">
            <span>Số dòng = {lines.length}</span>
            <div className="flex items-center gap-8">
              <span>
                Số lượng: <strong className="ml-1">{totalQty}</strong>
              </span>
              <span>
                Thành tiền:{" "}
                <strong className="ml-1">{formatMoneyInteger(totalAmount)}</strong>
              </span>
              {onProcessReceive && (
                <Button type="button" onClick={onProcessReceive}>
                  <PackagePlus className="mr-1 h-4 w-4" />
                  Xử lý nhập kho
                </Button>
              )}
            </div>
          </div>
        }
      />

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />

      <QuickCreateProviderDialog
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        onCreated={(p: QuickProvider) => {
          setCustomerId(p.id);
          setCustomerCode(p.code);
          setCustomerName(p.name);
          markDirty();
        }}
      />

      <QuickCreateLocationDialog
        open={quickLocationLineIdx !== null}
        onClose={() => setQuickLocationLineIdx(null)}
        onCreated={(loc: QuickLocation) => {
          const idx = quickLocationLineIdx;
          if (idx === null) return;
          const storageLabel =
            storages.find((s) => s.id === loc.storageId)?.name ?? "";
          setLines((prev) =>
            prev.map((l, i) =>
              i === idx
                ? {
                    ...l,
                    locationId: loc.id,
                    locationLabel: loc.code,
                    storageId: loc.storageId,
                    storageLabel,
                  }
                : l,
            ),
          );
          setQuickLocationLineIdx(null);
          markDirty();
        }}
        storages={storageCache}
      />

      <QuickCreateItemDialog
        open={quickItemLineIdx !== null}
        onClose={() => setQuickItemLineIdx(null)}
        onCreated={(item: QuickItem) => {
          const idx = quickItemLineIdx;
          if (idx === null) return;
          setLines((prev) =>
            normalizeFormLines(
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      itemId: item.id,
                      itemLabel: item.code,
                      itemName: item.name,
                      unit: item.unit,
                      unitPrice: Number(item.purchasePrice ?? 0),
                    }
                  : l,
              ),
            ),
          );
          setQuickItemLineIdx(null);
          markDirty();
        }}
      />

      <QuickCreateIssueReasonDialog
        open={quickReasonBucket !== null}
        purpose={quickReasonBucket ?? "OTHER"}
        onClose={() => setQuickReasonBucket(null)}
        onCreated={(r: QuickIssueReason) => {
          setReasonId(r.id);
          setReasonLabel(r.name);
          setQuickReasonBucket(null);
          markDirty();
        }}
      />

      {chooseKhoOpen && (
        <ChooseWarehouseDialog
          storages={storages}
          fieldLabel="Kho xuất"
          defaultStorageId={
            getPersistableFormLines(lines).find((l) => l.storageId)?.storageId
          }
          onClose={() => setChooseKhoOpen(false)}
          onConfirm={(s) => {
            setLines((prev) =>
              prev.map((l) => ({
                ...l,
                storageId: s.id,
                storageLabel: s.name,
                locationId: "",
                locationLabel: "",
              })),
            );
            markDirty();
          }}
        />
      )}

      {productPickerOpen && (
        <ProductSelectDialog
          open
          activeOnly
          onOpenChange={setProductPickerOpen}
          showQuantityPrice
          defaultUnitPriceSource="none"
          onConfirm={addLinesFromPicker}
        />
      )}

      <SelectTransferOrderDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={prefillFromTransferOrder}
      />

      <DocumentLineImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="goods-issues"
        title="Nhập khẩu hàng hóa xuất kho"
        description="Nhập khẩu hàng hóa vào phiếu xuất kho:"
        templateFileName="NhapKhauPhieuXKDieuChuyenHangHoa.xls"
        errorFileName="dong-xuat-kho-loi.xlsx"
        successMessage={(count) =>
          `${count} dòng đã được đưa vào phiếu xuất kho.`
        }
        columns={[
          { key: "sku", label: "Mã SKU", rawKey: "Mã SKU", width: 130 },
          { key: "storage", label: "Kho", rawKey: "Kho", width: 150 },
          { key: "location", label: "Vị trí", rawKey: "Vị trí", width: 120 },
          {
            key: "quantity",
            label: "Số lượng",
            rawKey: "Số lượng",
            width: 110,
            align: "right",
          },
          {
            key: "unitPrice",
            label: "Đơn giá",
            normalizedKey: "unitPrice",
            rawKey: "Đơn giá",
            width: 130,
            align: "right",
          },
        ]}
        onApplyDraft={handleApplyDraftImport}
      />

      {overstockWarnings && (
        <OverstockConfirmDialog
          rows={overstockWarnings}
          loading={saving}
          onCancel={() => setOverstockWarnings(null)}
          onConfirm={() => {
            setOverstockWarnings(null);
            void handleSave(true);
          }}
        />
      )}
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
