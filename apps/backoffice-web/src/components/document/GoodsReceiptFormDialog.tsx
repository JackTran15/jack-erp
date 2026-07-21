import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  Pencil,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  getPreferredShelf,
  getPreferredShelfBatch,
} from "../../api/inventory-location-preferences";
import {
  lookupItemByCode,
  type ItemLookupResult,
} from "../../api/item-lookup";
import {
  SelectTransferReceiptDialog,
  type TransferReceiptDetail,
} from "../../pages/purchase-orders/SelectTransferReceiptDialog";
import {
  DocumentType,
  type ImportableTransferOrderListItem,
} from "@erp/shared-interfaces";
import { LookupField } from "../../components/forms/LookupField";
import { CounterpartyPickerField } from "../../components/forms/CounterpartyPickerField";
import {
  QuickCreateItemDialog,
  QuickCreateLocationDialog,
  QuickCreateProviderDialog,
  type QuickItem,
  type QuickLocation,
  type QuickProvider,
} from "../../components/forms/QuickCreateDialogs";
import { ChooseWarehouseDialog } from "../../components/document/ChooseWarehouseDialog";
import {
  ensureTrailingBlankLine,
  getPersistableLines,
} from "../../pages/inventory-line-normalization";
import { GoodsReceiptImportDialog } from "../../pages/purchase-orders/import/GoodsReceiptImportDialog";
import type { GoodsReceiptImportJobRow } from "../../pages/purchase-orders/import/import-goods-receipt.types";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";
import { BarcodeScanRow } from "../shared/BarcodeScanRow";
import { getActiveBranchId } from "./goods-receipt-shared";
import type {
  PurchaseOrder,
  PaginatedResponse,
  InventoryProvider,
  InventoryLocation,
  InventoryStorage,
  InventoryItem,
} from "./goods-receipt-shared";

// ─── Form dialog (create / edit / view) ──────────────────────────────────────

interface FormLine {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  /** Warehouse ("Kho") this line is received into. */
  storageId: string;
  storageLabel: string;
  /** Bin / shelf location ("Vị trí") within the line's warehouse. */
  locationId: string;
  locationLabel: string;
  orderedQuantity: number;
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
  orderedQuantity: 1,
  unitPrice: 0,
  notes: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const normalizeFormLines = (nextLines: FormLine[]) =>
  ensureTrailingBlankLine(nextLines, emptyLine);

export function PurchaseOrderFormDialog({
  mode,
  initial,
  providers,
  storages,
  actionLoading,
  previewDocumentNumber,
  onClose,
  onSaved,
  onEdit,
  onVoid,
  onRequestDelete,
  autoOpenTransferPicker = false,
  autoSelectTransferOrder,
  documentKind = "warehouse-receipt",
}: {
  mode: "create" | "edit" | "view";
  initial: PurchaseOrder | null;
  providers: InventoryProvider[];
  storages: InventoryStorage[];
  actionLoading: boolean;
  previewDocumentNumber?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onEdit: () => void;
  /** Void/reverse the receipt → "Hoãn" toolbar button. */
  onVoid?: () => void;
  onRequestDelete?: () => void;
  autoOpenTransferPicker?: boolean;
  autoSelectTransferOrder?: {
    id: string;
    sourceBranchName?: string | null;
    exportGoodsIssueId?: string | null;
    exportGoodsIssueDocumentNumber?: string | null;
  } | null;
  documentKind?: "warehouse-receipt" | "purchase-import";
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isView = mode === "view";
  const canEdit = isView && initial?.status === "DRAFT";
  const isPurchaseImport = documentKind === "purchase-import";
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

  const initialProvider = useMemo(() => {
    // Prefer the resolved counterparty — the only source of a name for customer
    // / employee đối tượng (those have no provider_id and aren't in `providers`).
    if (initial?.counterparty)
      return {
        code: initial.counterparty.code ?? "",
        name: initial.counterparty.name,
      };
    if (!initial || !initial.providerId) return { code: "", name: "" };
    if (initial.provider)
      return { code: initial.provider.code, name: initial.provider.name };
    const p = providers.find((x) => x.id === initial.providerId);
    return p
      ? { code: p.code, name: p.name }
      : { code: initial.providerId ?? "", name: "" };
  }, [initial, providers]);

  const [providerId, setProviderId] = useState(
    initial?.counterpartyId ?? initial?.providerId ?? "",
  );
  const [providerCode, setProviderCode] = useState(initialProvider.code);
  const [providerName, setProviderName] = useState(initialProvider.name);
  // Đối tượng kind (supplier | customer | employee). Legacy rows with a
  // provider but no kind are treated as suppliers.
  const [counterpartyKind, setCounterpartyKind] = useState<
    "supplier" | "customer" | "employee" | ""
  >(initial?.counterpartyKind ?? (initial?.providerId ? "supplier" : ""));
  // Nhân viên mua hàng — user (users.id) responsible for the purchase. The
  // employee picker has no code, so its lookup value doubles as the display name.
  const [purchasingEmployeeId, setPurchasingEmployeeId] = useState(
    initial?.purchasingEmployeeId ?? initial?.purchasingEmployee?.id ?? "",
  );
  const [purchasingEmployeeName, setPurchasingEmployeeName] = useState(
    initial?.purchasingEmployee?.name ?? "",
  );
  /**
   * Storage = warehouse ("Kho"). The DB still stores a `locationId` (bin) on
   * the receipt header for legacy reasons, but the UI lets users pick a
   * warehouse here and a bin per-line. On save the header `locationId` is
   * derived from the first line's bin so the existing NOT NULL column stays
   * happy without a schema migration.
   */
  // On a fresh create, default the warehouse to the branch's main storage
  // (fallback: first available) so the first line's Kho is pre-filled.
  const activeBranchId = getActiveBranchId();
  const receivingStorages = useMemo(
    () =>
      storages.filter(
        (storage) =>
          storage.isActive !== false &&
          (!activeBranchId || storage.branchId === activeBranchId),
      ),
    [activeBranchId, storages],
  );
  const defaultStorage = useMemo(
    () =>
      receivingStorages.find((s) => s.isDefaultReceiving) ??
      receivingStorages.find((s) => s.isMainStorage) ??
      receivingStorages[0] ??
      null,
    [receivingStorages],
  );

  const initialStorageId = initial
    ? (initial.location?.storageId ?? "")
    : (defaultStorage?.id ?? "");
  const initialStorageLabel = initial
    ? initial.location?.storageId
      ? (storages.find((s) => s.id === initial.location!.storageId)?.name ?? "")
      : ""
    : (defaultStorage?.name ?? "");
  const [storageId, setStorageId] = useState(initialStorageId);
  const [storageQuery, setStorageQuery] = useState(initialStorageLabel);
  const [purpose, setPurpose] = useState<"PURCHASE" | "OTHER" | "TRANSFER">(
    isPurchaseImport
      ? "PURCHASE"
      : initial?.purpose === "TRANSFER_IN"
        ? "TRANSFER"
        : initial?.purpose === "PURCHASE"
          ? "PURCHASE"
          : "OTHER",
  );
  const [settlementMode, setSettlementMode] = useState<"CREDIT" | "CASH">(
    initial?.paymentMethod === "CASH" ? "CASH" : "CREDIT",
  );
  const [cashPaymentChannel, setCashPaymentChannel] = useState<"CASH" | "BANK">(
    "CASH",
  );
  const [purchaseTab, setPurchaseTab] = useState<"receipt" | "payment">(
    "receipt",
  );
  const [paymentDocumentNumber, setPaymentDocumentNumber] = useState("");
  useEffect(() => {
    if (settlementMode !== "CASH" && purchaseTab === "payment") {
      setPurchaseTab("receipt");
    }
  }, [purchaseTab, settlementMode]);
  useEffect(() => {
    if (
      !isPurchaseImport ||
      settlementMode !== "CASH" ||
      mode !== "create" ||
      paymentDocumentNumber
    ) {
      return;
    }
    let cancelled = false;
    void apiClient
      .post<string>("/document-numbers/preview", {
        documentType: DocumentType.CASH_PAYMENT,
      })
      .then(({ data: nextNumber }) => {
        if (!cancelled) setPaymentDocumentNumber(nextNumber);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Không sinh được số phiếu chi. Vui lòng thử lại.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isPurchaseImport, mode, paymentDocumentNumber, settlementMode]);
  const [sourceBranchId, setSourceBranchId] = useState(
    initial?.sourceBranchId ?? "",
  );
  const [sourceBranchLabel, setSourceBranchLabel] = useState("");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [deliveryPerson, setDeliveryPerson] = useState(
    initial?.deliveredBy ?? "",
  );
  const [notes, setNotes] = useState(initial?.description ?? "");
  // "Chọn chứng từ điều chuyển": when set, this receipt is the import leg of a
  // transfer order — Save calls the transfer import endpoint instead of creating
  // a standalone goods receipt, and the detail is locked.
  const [pickerOpen, setPickerOpen] = useState(false);

  const [sourceTransferOrderId, setSourceTransferOrderId] = useState<
    string | null
  >(
    initial?.referenceType === "STOCK_TRANSFER"
      ? (initial.referenceId ?? null)
      : null,
  );
  const [sourceExportGoodsIssueId, setSourceExportGoodsIssueId] = useState<
    string | null
  >(null);
  const [references, setReferences] = useState<string[]>(
    initial?.references ?? [],
  );
  // Lines come from the transfer order — lock Mã SKU / Số lượng / Đơn giá and
  // add/delete, but leave Kho + Vị trí editable so the user picks where to
  // receive (Vị trí auto-fills from the product's arrangement).
  const linesLocked = isView || sourceTransferOrderId !== null;
  const initialReceivedAt = initial?.receivedAt
    ? new Date(initial.receivedAt)
    : new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const [docDate, setDocDate] = useState(
    `${initialReceivedAt.getFullYear()}-${pad2(initialReceivedAt.getMonth() + 1)}-${pad2(initialReceivedAt.getDate())}`,
  );
  const [docTime, setDocTime] = useState(
    `${pad2(initialReceivedAt.getHours())}:${pad2(initialReceivedAt.getMinutes())}`,
  );
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [emptyLine()];

    const initialLines = initial.lines.map((l) => ({
      itemId: l.itemId,
      itemLabel: l.item?.code ?? l.itemId.slice(0, 8),
      itemName: l.item?.name ?? "",
      unit: l.uomCode ?? "",
      storageId: l.location?.storageId ?? "",
      storageLabel:
        storages.find((s) => s.id === l.location?.storageId)?.name ?? "",
      locationId: l.locationId,
      locationLabel: l.location?.code ?? l.locationId.slice(0, 8),
      orderedQuantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      notes: l.note ?? "",
    }));

    return isView ? initialLines : normalizeFormLines(initialLines);
  });
  // Bật/tắt hàng quét mã vạch phía trên bảng dòng (checkbox "Quét mã vạch").
  const [barcodeMode, setBarcodeMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  const autoSelectedTransferRef = useRef<string | null>(null);
  dirtyRef.current = dirty;

  // "Tham chiếu": when this receipt was auto-generated from a stock-take
  // ("Xử lý"), resolve the originating phiếu kiểm kê's document number (KK…).
  const [stockTakeRefNumber, setStockTakeRefNumber] = useState<
    string | undefined
  >(undefined);
  const stockTakeRefId =
    initial?.referenceType === "STOCK_TAKE" ? initial.referenceId : undefined;
  useEffect(() => {
    if (!stockTakeRefId) {
      setStockTakeRefNumber(undefined);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ documentNumber?: string }>(
          `/inventory/stock-takes/${stockTakeRefId}`,
        );
        if (!cancelled) setStockTakeRefNumber(data.documentNumber ?? undefined);
      } catch {
        // best-effort — the reference is informational only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stockTakeRefId]);

  useEffect(() => {
    if (!sourceTransferOrderId || sourceExportGoodsIssueId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<TransferReceiptDetail>(
          `/inventory/transfer-orders/${sourceTransferOrderId}`,
        );
        if (!cancelled) {
          setSourceExportGoodsIssueId(data.exportGoodsIssueId ?? null);
        }
      } catch {
        // best-effort — unresolved references remain readable plain text
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceExportGoodsIssueId, sourceTransferOrderId]);

  // The read carries only source_branch_id (no name) — resolve the branch label
  // so "Chọn cửa hàng nguồn" shows it when viewing/editing a transfer-in receipt.
  useEffect(() => {
    if (!initial?.sourceBranchId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ name?: string }>(
          `/branches/${initial.sourceBranchId}`,
        );
        if (!cancelled) setSourceBranchLabel(data.name ?? "");
      } catch {
        // best-effort — the label is informational
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.sourceBranchId]);

  const [quickProviderOpen, setQuickProviderOpen] = useState(false);
  /** Line index that triggered the quick-create-location dialog, or null. */
  const [quickLocationLineIdx, setQuickLocationLineIdx] = useState<
    number | null
  >(null);
  const [quickItemLineIdx, setQuickItemLineIdx] = useState<number | null>(null);
  const [chooseKhoOpen, setChooseKhoOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [storageCache, setStorageCache] = useState<
    Array<{ id: string; name: string; branchId: string }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "200" });
        const branchId = getActiveBranchId();
        if (branchId) params.set("branchId", branchId);
        params.set("activeOnly", "true");
        const { data } = await apiClient.get<
          PaginatedResponse<{ id: string; name: string; branchId: string }>
        >(`/inventory/storages?${params}`);
        if (!cancelled) setStorageCache(data.data);
      } catch {
        // best-effort — quick-create location modal will show empty list
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the dialog opens for a new receipt before warehouses finished loading,
  // back-fill the default (main) storage once it arrives — but never override a
  // warehouse the user already picked or an existing receipt's saved warehouse.
  useEffect(() => {
    if (initial || storageId || !defaultStorage) return;
    setStorageId(defaultStorage.id);
    setStorageQuery(defaultStorage.name);
  }, [initial, storageId, defaultStorage]);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const handleApplyDraftImport = useCallback(
    (importedRows: GoodsReceiptImportJobRow[]) => {
      const mapped = importedRows.flatMap((row) => {
        const normalized = row.normalizedData;
        if (!normalized) return [];
        return [
          {
            itemId: normalized.itemId,
            itemLabel: normalized.itemCode,
            itemName: normalized.itemName,
            unit: normalized.unit,
            storageId: normalized.storageId,
            storageLabel: normalized.storageName,
            locationId: normalized.locationId,
            locationLabel: normalized.locationCode,
            orderedQuantity: normalized.quantity,
            unitPrice: normalized.unitPrice,
            notes: normalized.note,
          },
        ];
      });
      setLines(normalizeFormLines(mapped));
      if (mapped[0]) {
        setStorageId(mapped[0].storageId);
        setStorageQuery(mapped[0].storageLabel);
      }
      setDirty(true);
    },
    [],
  );

  /** Load a picked transfer order into the form as the import leg (locked detail). */
  const prefillFromTransferOrder = useCallback(
    (detail: TransferReceiptDetail, row: ImportableTransferOrderListItem) => {
      setPurpose("TRANSFER");
      setSourceBranchId(detail.sourceBranchId);
      setSourceBranchLabel(row.sourceBranchName);
      const xk =
        row.exportGoodsIssueDocumentNumber ?? detail.documentNumber ?? "";
      setReferences(xk ? [xk] : []);
      setSourceTransferOrderId(detail.id);
      setSourceExportGoodsIssueId(
        row.exportGoodsIssueId ?? detail.exportGoodsIssueId ?? null,
      );
      setNotes(
        `Nhập kho hàng hóa điều chuyển từ cửa hàng ${row.sourceBranchName}`,
      );
      const targetStorageId = defaultStorage?.id ?? "";
      const targetStorageLabel = defaultStorage?.name ?? "";
      if (targetStorageId) {
        setStorageId(targetStorageId);
        setStorageQuery(targetStorageLabel);
      }
      const mapped: FormLine[] = detail.lines.map((l) => ({
        itemId: l.itemId,
        itemLabel: l.item?.code ?? "",
        itemName: l.item?.name ?? "",
        unit: l.item?.unit ?? "",
        storageId: targetStorageId,
        storageLabel: targetStorageLabel,
        locationId: "",
        locationLabel: "",
        orderedQuantity: Number(l.requestedQty),
        unitPrice: Number(l.item?.purchasePrice ?? 0),
        notes: l.note ?? "",
      }));
      setLines(mapped);
      if (targetStorageId) {
        // Auto-fill Vị trí like MISA: preferred shelf per item, else fall back to
        // the warehouse's default/unassigned bin (mirrors the save-time resolution
        // so the receipt can be created immediately without manual picking).
        void (async () => {
          let storageFallback: { id: string; label: string } | null = null;
          const ensureStorageFallback = async () => {
            if (storageFallback) return storageFallback;
            try {
              const { data } = await apiClient.get<
                PaginatedResponse<InventoryLocation>
              >(
                `/inventory/locations?page=1&pageSize=50&storageId=${encodeURIComponent(targetStorageId)}&includeUnassigned=true&activeOnly=true`,
              );
              const locs = data.data ?? [];
              const pick =
                locs.find((l) => l.isUnassigned === true) ??
                locs.find((l) => l.code === "__UNASSIGNED__") ??
                locs[0];
              if (pick) {
                storageFallback = {
                  id: pick.id,
                  label: pick.isUnassigned ? pick.name : pick.code,
                };
              }
            } catch {
              storageFallback = null;
            }
            return storageFallback;
          };
          for (let index = 0; index < mapped.length; index++) {
            const line = mapped[index];
            const shelf = await getPreferredShelf(
              line.itemId,
              targetStorageId,
            ).catch(() => null);
            const resolved = shelf
              ? { id: shelf.id, label: shelf.code }
              : await ensureStorageFallback();
            if (!resolved) continue;
            setLines((currentLines) =>
              currentLines.map((current, lineIndex) =>
                lineIndex === index &&
                current.itemId === line.itemId &&
                current.storageId === targetStorageId &&
                !current.locationId
                  ? {
                      ...current,
                      locationId: resolved.id,
                      locationLabel: resolved.label,
                    }
                  : current,
              ),
            );
          }
        })();
      }
      markDirty();
    },
    // markDirty/set* are stable closures over component scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultStorage],
  );

  useEffect(() => {
    if (!autoOpenTransferPicker || mode !== "create") return;
    setPurpose("TRANSFER");
    if (!autoSelectTransferOrder?.id) {
      setPickerOpen(true);
      return;
    }
    // Wait for the active branch's receiving warehouse before prefilling. The
    // effect can rerun when storage data arrives; guard the transfer id so a
    // late props update never resets Kho/Vị trí already chosen by the user.
    if (!defaultStorage) return;
    if (autoSelectedTransferRef.current === autoSelectTransferOrder.id) return;
    autoSelectedTransferRef.current = autoSelectTransferOrder.id;
    void (async () => {
      try {
        const { data } = await apiClient.get<TransferReceiptDetail>(
          `/inventory/transfer-orders/${autoSelectTransferOrder.id}`,
        );
        prefillFromTransferOrder(data, {
          id: autoSelectTransferOrder.id,
          documentNumber: data.documentNumber ?? "",
          requestedDate: null,
          notes: data.notes ?? null,
          sourceBranchId: data.sourceBranchId,
          sourceBranchName:
            autoSelectTransferOrder.sourceBranchName ?? data.sourceBranchId,
          exportGoodsIssueId:
            autoSelectTransferOrder.exportGoodsIssueId ??
            data.exportGoodsIssueId ??
            null,
          exportGoodsIssueDocumentNumber:
            autoSelectTransferOrder.exportGoodsIssueDocumentNumber ?? null,
          importGoodsReceiptId: null,
          counterpartyName: null,
          totalAmount: 0,
          lines: [],
          status: "IN_PROGRESS" as ImportableTransferOrderListItem["status"],
        });
      } catch (err) {
        autoSelectedTransferRef.current = null;
        toast.error(getUserFacingApiErrorMessage(err));
        setPickerOpen(true);
      }
    })();
  }, [
    autoOpenTransferPicker,
    autoSelectTransferOrder,
    mode,
    prefillFromTransferOrder,
    defaultStorage,
  ]);

  /** Unlink the transfer order — the form reverts to a plain goods receipt. */
  const clearTransferSource = () => {
    setSourceTransferOrderId(null);
    setSourceExportGoodsIssueId(null);
    setReferences([]);
    markDirty();
  };

  /**
   * Auto-fill a line's Vị trí from the product's arranged bin ("đã sắp") in the
   * chosen Kho. No-op when the product isn't arranged there. Best-effort: only
   * fills if the row still points at the same Kho with no bin picked meanwhile.
   */
  const autoFillAssignedLocation = useCallback(
    async (idx: number, itemId: string, storageId: string) => {
      try {
        const { data } = await apiClient.get<{
          locationId: string;
          code: string;
        } | null>(
          `/products/storage-location?itemId=${encodeURIComponent(itemId)}&storageId=${encodeURIComponent(storageId)}`,
        );
        if (!data) return;
        setLines((prev) =>
          prev.map((l, i) =>
            i === idx && l.storageId === storageId && !l.locationId
              ? { ...l, locationId: data.locationId, locationLabel: data.code }
              : l,
          ),
        );
      } catch {
        // best-effort — the user can still pick Vị trí manually
      }
    },
    [],
  );

  // Multi-select product picker → append one line per chosen item (dedupe by itemId),
  // pre-filling Số lượng/Đơn giá from the dialog and the warehouse from "Chọn kho"/default.
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
        orderedQuantity: s.quantity > 0 ? s.quantity : 1,
        unitPrice:
          s.unitPrice > 0 ? s.unitPrice : Number(s.purchasePrice ?? 0) || 0,
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
  };

  // Mỗi lần quét resolve đúng một item → cộng dồn nếu đã có dòng, ngược lại
  // thêm dòng mới. Dùng chung helper với addLinesFromPicker để dòng quét chạy
  // giống hệt (chuẩn hoá dòng trống đuôi, tự điền vị trí "đã sắp" theo kho).
  const handleScanResolved = (item: ItemLookupResult, qty: number) => {
    const existingIdx = lines.findIndex((l) => l.itemId === item.itemId);
    if (existingIdx >= 0) {
      setLines((prev) =>
        prev.map((l, i) =>
          i === existingIdx
            ? { ...l, orderedQuantity: (l.orderedQuantity || 0) + qty }
            : l,
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
      orderedQuantity: qty > 0 ? qty : 1,
      unitPrice: Number(item.purchasePrice ?? 0) || 0,
      notes: "",
    };
    const base = getPersistableFormLines(lines);
    const startIdx = base.length;
    setLines(normalizeFormLines([...base, newLine]));
    markDirty();
    fillPreferredShelfBatch([
      { idx: startIdx, itemId: newLine.itemId, storageId: newLine.storageId },
    ]);
  };

  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      // Storages list is small — filter the cached page client-side rather
      // than hitting the API on every keystroke. The page-level fetch
      // already pulls up to 200 storages, which covers all real orgs.
      const filtered = q
        ? receivingStorages.filter((s) => s.name.toLowerCase().includes(q))
        : receivingStorages;
      const effectivePageSize = pageSize ?? 8;
      const start = (page - 1) * effectivePageSize;
      const items = filtered.slice(start, start + effectivePageSize);
      return {
        items,
        hasMore: start + effectivePageSize < filtered.length,
        total: filtered.length,
      };
    },
    [receivingStorages],
  );

  const searchLocationsForStorage = useCallback(
    async (
      storageIdArg: string,
      query: string,
      page: number,
      pageSize?: number,
    ) => {
      if (!storageIdArg) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
        storageId: storageIdArg,
        activeOnly: "true",
      });
      const { data } = await apiClient.get<
        PaginatedResponse<InventoryLocation>
      >(`/inventory/locations?${params}`);
      const fetched = data.page * data.pageSize;
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
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
      const { data } = await apiClient.get<
        PaginatedResponse<{ id: string; name: string; address?: string | null }>
      >(`/branches?${params}`);
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

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce(
    (s, l) => s + Number(l.orderedQuantity || 0),
    0,
  );
  const totalAmount = summaryLines.reduce(
    (s, l) => s + Number(l.orderedQuantity || 0) * Number(l.unitPrice || 0),
    0,
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    const receiptPurpose = isPurchaseImport ? "PURCHASE" : purpose;
    if (receiptPurpose === "PURCHASE" && !providerId) {
      toast.error("Vui lòng chọn nhà cung cấp cho phiếu nhập hàng mua.");
      return false;
    }
    if (receiptPurpose === "PURCHASE" && counterpartyKind !== "supplier") {
      toast.error("Phiếu nhập hàng mua chỉ được chọn nhà cung cấp.");
      return false;
    }
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng hàng hợp lệ.");
      return false;
    }
    if (persistableLines.some((l) => !l.storageId)) {
      toast.error("Mỗi dòng hàng phải chọn kho.");
      return false;
    }
    setSaving(true);
    try {
      // Resolve a concrete bin per line. Lines may sit in different warehouses,
      // so fall back to the first bin of each line's OWN warehouse (cached).
      const fallbackByStorage = new Map<string, string>();
      const resolvedLines: FormLine[] = [];
      for (const l of persistableLines) {
        let locationId = l.locationId;
        if (!locationId) {
          const preferred = await getPreferredShelf(
            l.itemId,
            l.storageId,
          ).catch(() => null);
          if (preferred) {
            locationId = preferred.id;
          }
        }
        if (!locationId) {
          let fb = fallbackByStorage.get(l.storageId);
          if (fb === undefined) {
            const { data } = await apiClient.get<
              PaginatedResponse<InventoryLocation>
            >(
              `/inventory/locations?page=1&pageSize=50&storageId=${encodeURIComponent(l.storageId)}&includeUnassigned=true&activeOnly=true`,
            );
            const locations = data.data;
            if (!locations || locations.length === 0) {
              toast.error(
                "Có kho chưa có vị trí nào. Vui lòng tạo ít nhất 1 vị trí trước.",
              );
              setSaving(false);
              return false;
            }
            const unassigned =
              locations.find((loc) => loc.isUnassigned === true) ??
              locations.find((loc) => loc.code === "__UNASSIGNED__") ??
              locations[0];
            fb = unassigned.id;
            fallbackByStorage.set(l.storageId, fb);
          }
          locationId = fb;
        }
        resolvedLines.push({ ...l, locationId });
      }

      const receivedAtIso = combineDateTimeISO(docDate, docTime);
      // The header.locationId is a legacy anchor — use the first line's bin so
      // the backend's NOT NULL stays satisfied. Lines carry the real kho/bin
      // per row (with fallback applied above).
      const headerLocationId = resolvedLines[0]?.locationId ?? "";
      const payload = {
        purpose:
          receiptPurpose === "TRANSFER"
            ? "TRANSFER_IN"
            : receiptPurpose === "PURCHASE"
              ? "PURCHASE"
              : "OTHER",
        counterpartyKind: counterpartyKind || undefined,
        counterpartyId: providerId || undefined,
        paymentMethod:
          receiptPurpose === "PURCHASE" ? settlementMode : undefined,
        deliveredBy: deliveryPerson || undefined,
        purchasingEmployeeId: purchasingEmployeeId || undefined,
        reason: reason || undefined,
        description: notes || undefined,
        sourceBranchId:
          receiptPurpose === "TRANSFER"
            ? sourceBranchId || undefined
            : undefined,
        receivedAt: receivedAtIso,
        locationId: headerLocationId,
        lines: resolvedLines.map((l) => ({
          itemId: l.itemId,
          locationId: l.locationId,
          uomCode: l.unit || "Cái",
          quantity: Number(l.orderedQuantity),
          unitPrice: Number(l.unitPrice),
          note: l.notes || undefined,
        })),
      };
      if (sourceTransferOrderId) {
        // Import leg of a transfer order: post via the two-phase import endpoint
        // with the form's per-line Kho/Vị trí + header fields. Advances the
        // order IN_PROGRESS → COMPLETED server-side.
        await apiClient.post(
          `/inventory/transfer-orders/${sourceTransferOrderId}/import`,
          {
            lines: resolvedLines.map((l) => ({
              itemId: l.itemId,
              locationId: l.locationId,
              quantity: Number(l.orderedQuantity),
              unitPrice: Number(l.unitPrice),
              note: l.notes || undefined,
            })),
            // Route Đối tượng through the validated counterparty path (same as
            // the normal receipt payload above); a bare providerId would bypass
            // validation and can violate the goods_receipts provider FK.
            counterpartyKind: counterpartyKind || undefined,
            counterpartyId: providerId || undefined,
            deliverer: deliveryPerson || undefined,
            references: references.length ? references : undefined,
            occurredAt: receivedAtIso,
          },
        );
        await queryClient.invalidateQueries({
          queryKey: ["inventory-transfer-orders-importable-count"],
        });
      } else if (initial && mode === "edit") {
        await apiClient.patch(`/goods-receipts/${initial.id}`, payload);
      } else {
        // Create now saves + posts atomically: the phiếu lands POSTED with the
        // stock ledger written, so it appears in reports immediately.
        await apiClient.post("/goods-receipts", payload);
      }
      setDirty(false);
      toast.success(
        mode === "edit"
          ? isPurchaseImport
            ? "Đã cập nhật phiếu nhập hàng."
            : "Đã cập nhật phiếu nhập kho."
          : isPurchaseImport
            ? "Đã nhập hàng thành công."
            : "Đã nhập kho thành công.",
      );
      await onSaved();
      return true;
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    purpose,
    isPurchaseImport,
    settlementMode,
    providerId,
    lines,
    docDate,
    docTime,
    notes,
    reason,
    deliveryPerson,
    sourceBranchId,
    sourceTransferOrderId,
    references,
    counterpartyKind,
    initial,
    mode,
    onSaved,
    queryClient,
  ]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    if (choice === "save") {
      const ok = await handleSave();
      if (ok) onClose();
    } else if (choice === "discard") {
      onClose();
    }
  };

  const dialogToolbar: ToolbarItem[] = [
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
      icon: CloudUpload,
      disabled: true,
      onClick: () => {},
    },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

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
    markDirty();
  };

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 360,
      minWidth: 360,
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
              {
                key: "code",
                label: "Mã",
                className: "w-[120px] font-mono",
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
            disabled={linesLocked}
            onCreateNew={
              linesLocked ? undefined : () => setQuickItemLineIdx(idx)
            }
            className="h-full flex-1"
          />
        </div>
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 280,
      minWidth: 280,
      type: "readonly",
      getValue: (row) => row.itemName,
    },
    {
      key: "warehouse",
      label: "Kho",
      width: 220,
      minWidth: 220,
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
            // Auto-fill Vị trí from the product's arrangement ("đã sắp").
            if (row.itemId)
              void autoFillAssignedLocation(idx, row.itemId, s.id);
          }}
          search={searchStorages}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={() => ""}
          columns={[{ key: "name", label: "Tên kho", render: (s) => s.name }]}
          disabled={isView}
          className="h-full"
        />
      ),
    },
    {
      key: "position",
      label: "Vị trí",
      width: 220,
      minWidth: 220,
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
          search={(q, p, ps) =>
            searchLocationsForStorage(row.storageId, q, p, ps)
          }
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          columns={[
            {
              key: "code",
              label: "Mã",
              className: "w-[120px] font-mono",
              render: (l) => l.code,
            },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={isView || !row.storageId}
          onCreateNew={
            isView || !row.storageId
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
      minWidth: 100,
      type: "readonly",
      getValue: (r) => r.unit || "Đôi",
    },
    {
      key: "orderedQuantity",
      label: "Số lượng",
      width: 110,
      minWidth: 110,
      type: "number",
      align: "right",
      filterSymbol: "≤",
      footer: totalQty.toLocaleString("vi-VN"),
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 140,
      minWidth: 140,
      align: "right",
      filterSymbol: "≤",
      renderEditor: (row, idx) => (
        <MoneyInput
          disabled={linesLocked}
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
      minWidth: 150,
      type: "readonly",
      align: "right",
      filterSymbol: "≤",
      getValue: (r) =>
        formatMoneyInteger(Number(r.orderedQuantity) * Number(r.unitPrice)),
      footer: formatMoneyInteger(totalAmount),
    },
    ...(isPurchaseImport
      ? ([
          {
            key: "discountPercent",
            label: "% CK",
            width: 90,
            minWidth: 90,
            type: "readonly",
            align: "right",
            getValue: () => "0",
          },
          {
            key: "discountAmount",
            label: "Tiền CK",
            width: 120,
            minWidth: 120,
            type: "readonly",
            align: "right",
            getValue: () => "0",
            footer: "0",
          },
          {
            key: "taxRate",
            label: "Thuế suất",
            width: 110,
            minWidth: 110,
            type: "readonly",
            align: "right",
            getValue: () => "",
          },
          {
            key: "taxAmount",
            label: "Tiền thuế",
            width: 120,
            minWidth: 120,
            type: "readonly",
            align: "right",
            getValue: () => "0",
            footer: "0",
          },
          {
            key: "payableAmount",
            label: "Tiền thanh toán",
            width: 150,
            minWidth: 150,
            type: "readonly",
            align: "right",
            getValue: (r: FormLine) =>
              formatMoneyInteger(
                Number(r.orderedQuantity) * Number(r.unitPrice),
              ),
            footer: formatMoneyInteger(totalAmount),
          },
        ] satisfies LineColumn<FormLine>[])
      : []),
    { key: "notes", label: "Ghi chú", width: 200, minWidth: 200 },
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={
          isPurchaseImport
            ? mode === "create"
              ? "Thêm mới Phiếu nhập hàng"
              : `Phiếu nhập hàng ${initial?.documentNumber ?? ""}`
            : mode === "create"
              ? "Thêm mới phiếu nhập kho"
              : `Phiếu nhập kho ${initial?.documentNumber ?? ""}`
        }
        toolbarItems={dialogToolbar}
        purpose={
          isPurchaseImport ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={settlementMode === "CREDIT"}
                  onChange={() => {
                    setSettlementMode("CREDIT");
                    setPurchaseTab("receipt");
                    markDirty();
                  }}
                  disabled={isView}
                />
                Ghi nợ nhà cung cấp
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={settlementMode === "CASH"}
                  onChange={() => {
                    setSettlementMode("CASH");
                    markDirty();
                  }}
                  disabled={isView}
                />
                Thanh toán ngay
              </label>
              <select
                className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
                value={cashPaymentChannel}
                onChange={(e) => {
                  setCashPaymentChannel(e.target.value as "CASH" | "BANK");
                  markDirty();
                }}
                disabled={isView || settlementMode !== "CASH"}
              >
                <option value="CASH">Tiền mặt</option>
                <option value="BANK" disabled>
                  Tiền gửi
                </option>
              </select>
              <Button type="button" variant="outline" size="sm" disabled>
                Chọn phiếu đặt hàng
              </Button>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" disabled={isView} />
                Nhận kèm hóa đơn
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">Mục đích nhập kho</span>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={purpose === "OTHER"}
                  onChange={() => {
                    setPurpose("OTHER");
                    setSourceBranchId("");
                    setSourceBranchLabel("");
                    markDirty();
                  }}
                  disabled={isView}
                />
                Khác
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={purpose === "TRANSFER"}
                  onChange={() => {
                    setPurpose("TRANSFER");
                    markDirty();
                  }}
                  disabled={isView}
                />
                Điều chuyển từ cửa hàng khác
              </label>
              {purpose === "TRANSFER" ? (
                <>
                  <div className="w-[260px]">
                    <LookupField
                      enableSearchModal
                      searchModalTitle="Chọn cửa hàng nguồn"
                      searchModalPlaceholder="Nhập tên cửa hàng"
                      placeholder="Chọn cửa hàng nguồn"
                      value={sourceBranchLabel}
                      onValueChange={(v) => {
                        setSourceBranchLabel(v);
                        setSourceBranchId("");
                      }}
                      onSelect={(b) => {
                        setSourceBranchId(b.id);
                        setSourceBranchLabel(b.name);
                        setNotes(
                          `Nhập kho hàng hóa điều chuyển từ cửa hàng ${b.name}`,
                        );
                        markDirty();
                      }}
                      search={searchBranches}
                      itemKey={(b) => b.id}
                      renderItem={(b) => b.name}
                      renderMeta={(b) => b.address ?? ""}
                      columns={[
                        {
                          key: "name",
                          label: "Tên cửa hàng",
                          render: (b) => b.name,
                        },
                        {
                          key: "address",
                          label: "Địa chỉ",
                          render: (b) => b.address ?? "—",
                        },
                      ]}
                      disabled={isView}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={isView}
                  >
                    Chọn chứng từ điều chuyển
                  </Button>
                </>
              ) : null}
            </div>
          )
        }
        generalInfo={
          <>
            {isPurchaseImport ? (
              <div className="mb-3 flex border-b bg-muted/40">
                <button
                  type="button"
                  className={`border-b-2 px-4 py-2 text-sm font-medium ${
                    purchaseTab === "receipt"
                      ? "border-primary-blue text-primary-blue"
                      : "border-transparent text-muted-foreground"
                  }`}
                  onClick={() => setPurchaseTab("receipt")}
                >
                  Phiếu nhập
                </button>
                {settlementMode === "CASH" ? (
                  <button
                    type="button"
                    className={`border-b-2 px-4 py-2 text-sm font-medium ${
                      purchaseTab === "payment"
                        ? "border-primary-blue text-primary-blue"
                        : "border-transparent text-muted-foreground"
                    }`}
                    onClick={() => setPurchaseTab("payment")}
                  >
                    Phiếu chi
                  </button>
                ) : null}
              </div>
            ) : null}
            <FieldRow label={isPurchaseImport ? "Nhà cung cấp" : "Đối tượng"}>
              <div className="flex items-stretch gap-2">
                <CounterpartyPickerField
                  defaultType="supplier"
                  allowedTypes={
                    isPurchaseImport || purpose === "PURCHASE"
                      ? ["supplier"]
                      : ["supplier", "customer", "employee"]
                  }
                  className="w-[180px]"
                  dropdownMinWidth={500}
                  modalTitle="Chọn đối tượng"
                  modalPlaceholder="Nhập mã hoặc tên đối tượng"
                  value={providerCode}
                  onValueChange={(v) => {
                    setProviderCode(v);
                    setProviderId("");
                    setProviderName("");
                    setCounterpartyKind("");
                    markDirty();
                  }}
                  onSelect={(c) => {
                    setProviderId(c.id);
                    setProviderCode(c.code ?? "");
                    setProviderName(c.name);
                    setCounterpartyKind(c.kind);
                    markDirty();
                  }}
                  disabled={isView}
                  onCreateNew={
                    isView ? undefined : () => setQuickProviderOpen(true)
                  }
                />
                <Input
                  className="flex-1"
                  placeholder="Tên đối tượng"
                  value={providerName}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </FieldRow>
            <FieldRow
              label={
                isPurchaseImport && purchaseTab === "payment"
                  ? "Người nhận"
                  : "Người giao"
              }
            >
              <Input
                value={deliveryPerson}
                onChange={(e) => {
                  setDeliveryPerson(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            {isPurchaseImport && purchaseTab === "payment" ? (
              <>
                <FieldRow label="Địa chỉ">
                  <Input disabled={isView} />
                </FieldRow>
                <FieldRow label="Lý do chi">
                  <Input value="Thanh toán tiền nhập hàng hóa" readOnly />
                </FieldRow>
              </>
            ) : purpose === "TRANSFER" || isPurchaseImport ? null : (
              <FieldRow label="Lý do">
                <Input
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    markDirty();
                  }}
                  disabled={isView}
                />
              </FieldRow>
            )}
            {isPurchaseImport && purchaseTab === "payment" ? null : (
              <FieldRow label="Diễn giải">
                <Input
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    markDirty();
                  }}
                  disabled={isView}
                />
              </FieldRow>
            )}
            {isPurchaseImport && purchaseTab === "receipt" ? (
              <FieldRow label="NV mua hàng">
                <CounterpartyPickerField
                  defaultType="employee"
                  allowedTypes={["employee"]}
                  dropdownMinWidth={500}
                  modalTitle="Chọn nhân viên mua hàng"
                  modalPlaceholder="Nhập mã hoặc tên nhân viên"
                  placeholder="Chọn nhân viên"
                  value={purchasingEmployeeName}
                  onValueChange={(v) => {
                    setPurchasingEmployeeName(v);
                    setPurchasingEmployeeId("");
                    markDirty();
                  }}
                  onSelect={(c) => {
                    setPurchasingEmployeeId(c.id);
                    setPurchasingEmployeeName(c.name);
                    markDirty();
                  }}
                  disabled={isView}
                />
              </FieldRow>
            ) : null}
            <FieldRow label="Tham chiếu">
              {(() => {
                // FE-supplied reference list (e.g. the source XK number), plus
                // any resolved stock-take linkage not already in it.
                const refs = [
                  ...references,
                  ...(stockTakeRefNumber &&
                  !references.includes(stockTakeRefNumber)
                    ? [stockTakeRefNumber]
                    : []),
                ];
                return refs.length ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {refs.map((r) =>
                      r === stockTakeRefNumber && stockTakeRefId ? (
                        <button
                          key={r}
                          type="button"
                          className="text-sm font-medium text-primary-blue hover:text-primary-blue-hover hover:underline"
                          onClick={() =>
                            navigate("/inventory/stock-takes", {
                              state: { openDocumentId: stockTakeRefId },
                            })
                          }
                        >
                          {r}
                        </button>
                      ) : sourceExportGoodsIssueId && r === references[0] ? (
                        <button
                          key={r}
                          type="button"
                          className="text-sm font-medium text-primary-blue hover:text-primary-blue-hover hover:underline"
                          onClick={() =>
                            navigate("/inventory/goods-issues", {
                              state: {
                                openDocumentId: sourceExportGoodsIssueId,
                              },
                            })
                          }
                        >
                          {r}
                        </button>
                      ) : (
                        <span
                          key={r}
                          className="text-sm font-medium text-foreground"
                        >
                          {r}
                        </span>
                      ),
                    )}
                    {sourceTransferOrderId && !isView ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-destructive hover:underline"
                        title="Gỡ liên kết chứng từ điều chuyển"
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
            <FieldRow
              label={
                isPurchaseImport && purchaseTab === "payment"
                  ? "Số phiếu chi"
                  : "Số phiếu nhập"
              }
            >
              <Input
                value={
                  isPurchaseImport && purchaseTab === "payment"
                    ? paymentDocumentNumber
                    : (initial?.documentNumber ?? previewDocumentNumber ?? "")
                }
                readOnly
                title={
                  initial?.documentNumber
                    ? undefined
                    : "Số dự kiến — hệ thống sẽ chốt khi lưu"
                }
              />
            </FieldRow>
            <FieldRow
              label={
                isPurchaseImport && purchaseTab === "payment"
                  ? "Ngày chi"
                  : "Ngày nhập"
              }
            >
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
            {isPurchaseImport && purchaseTab === "payment" ? null : (
              <FieldRow label="Giờ nhập">
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
            )}
          </>
        }
        detailActions={
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
              onClick={() => setChooseKhoOpen(true)}
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover"
            >
              Chọn kho
            </button>
            <button
              type="button"
              disabled={linesLocked || saving}
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Nhập khẩu
            </button>
          </>
        }
        detail={
          <>
            {/* Hàng quét mã vạch hiện phía trên bảng dòng khi bật checkbox. */}
            {barcodeMode && (
              <BarcodeScanRow
                lookup={lookupItemByCode}
                onResolved={handleScanResolved}
                getSku={(i) => i.code}
                getName={(i) => i.name}
                disabled={linesLocked}
              />
            )}
            <LineItemGrid
              columns={lineColumns}
              rows={lines}
              // Omitting onChangeCell makes the built-in cells (Số lượng) read-only.
              onChangeCell={
                linesLocked
                  ? undefined
                  : (idx, key, value) => {
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, [key]: value } : l,
                        ),
                      );
                      markDirty();
                    }
              }
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
              showAddRow={!linesLocked}
              showRowActions={!linesLocked}
            />
          </>
        }
        footerSummary={
          isPurchaseImport ? (
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
              <span>
                Tổng số lượng <strong className="ml-1">{totalQty}</strong>
              </span>
              <span>
                Tổng thành tiền{" "}
                <strong className="ml-1">
                  {formatMoneyInteger(totalAmount)}
                </strong>
              </span>
              <span>
                Tiền CK <strong className="ml-1">0</strong>
              </span>
              <span>
                Tiền thuế <strong className="ml-1">0</strong>
              </span>
              <span>
                Tổng tiền thanh toán{" "}
                <strong className="ml-1">
                  {formatMoneyInteger(totalAmount)}
                </strong>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span>Số dòng = {lines.length}</span>
              <div className="flex gap-8">
                <span>
                  Số lượng: <strong className="ml-1">{totalQty}</strong>
                </span>
                <span>
                  Thành tiền:{" "}
                  <strong className="ml-1">
                    {formatMoneyInteger(totalAmount)}
                  </strong>
                </span>
              </div>
            </div>
          )
        }
      />

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />

      <QuickCreateProviderDialog
        open={quickProviderOpen}
        onClose={() => setQuickProviderOpen(false)}
        onCreated={(p: QuickProvider) => {
          setProviderId(p.id);
          setProviderCode(p.code);
          setProviderName(p.name);
          setCounterpartyKind("supplier");
          markDirty();
        }}
      />

      <QuickCreateLocationDialog
        open={quickLocationLineIdx !== null}
        onClose={() => setQuickLocationLineIdx(null)}
        onCreated={(loc: QuickLocation) => {
          const idx = quickLocationLineIdx;
          if (idx === null) return;
          setLines((prev) =>
            prev.map((l, i) =>
              i === idx
                ? { ...l, locationId: loc.id, locationLabel: loc.code }
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

      {chooseKhoOpen && (
        <ChooseWarehouseDialog
          storages={storages}
          fieldLabel="Kho nhập"
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
          defaultUnitPriceSource="purchasePrice"
          onConfirm={addLinesFromPicker}
        />
      )}

      <SelectTransferReceiptDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={prefillFromTransferOrder}
      />

      <GoodsReceiptImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onApplyDraft={handleApplyDraftImport}
      />
    </>
  );
}

function combineDateTimeISO(date: string, time: string): string {
  // date = YYYY-MM-DD, time = HH:mm
  const safeDate = date || new Date().toISOString().slice(0, 10);
  const safeTime = (time && time.length >= 4 ? time : "00:00").slice(0, 5);
  // Build local-time ISO with timezone offset, e.g. 2026-05-14T21:23:00+07:00
  const d = new Date(`${safeDate}T${safeTime}:00`);
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offsetH = pad(tz / 60);
  const offsetM = pad(tz % 60);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00${sign}${offsetH}:${offsetM}`;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}

export { PurchaseOrderFormDialog as GoodsReceiptFormDialog };
