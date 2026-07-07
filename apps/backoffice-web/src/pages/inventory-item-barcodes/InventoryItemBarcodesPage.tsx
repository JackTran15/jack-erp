import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";
import { useTrailingEmptyRow } from "../../hooks/useTrailingEmptyRow";
import { apiClient } from "../../lib/api-axios";
import { getActiveBranch } from "../../lib/auth-storage";
import { useBarcodePrintSettingsStore } from "../../store/page-stores/inventory-item-barcodes/barcode-print-settings.store";
import { useMyBranches } from "../../hooks/iam/useBranches";
import {
  isEmptyRow,
  makeEmptyRow,
  type BarcodeLabelRow,
} from "./_lib/barcode-label-row.type";
import { renderBarcodeLabelsPdf } from "./_lib/render-barcode-labels-pdf";
import { printBarcodeLabels } from "./_lib/print-barcode-labels";
import { resolveItemLocations } from "./_lib/resolve-item-locations";
import {
  BARCODE_SKU_INPUT_ID,
  BarcodeLabelGrid,
  type BarcodeItemOption,
  type BarcodeItemSearchResult,
} from "./BarcodeLabelGrid/BarcodeLabelGrid";
import { BarcodePrintSidebar } from "./BarcodePrintSidebar/BarcodePrintSidebar";
import { BarcodeShortcutBar } from "./BarcodeShortcutBar/BarcodeShortcutBar";

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface InventoryStorageOption {
  id: string;
  name: string;
  branchId: string;
}

/** Parse số filter định dạng vi-VN ("750.000" / "1,5") — null khi không hợp lệ. */
function parseFilterNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function focusSkuInput() {
  document.getElementById(BARCODE_SKU_INPUT_ID)?.focus();
}

/** Màn hình "In tem mã": bảng hàng hoá cần in tem + cấu hình tem mã vạch. */
export function InventoryItemBarcodesPage() {
  const [rows, setRows] = useState<BarcodeLabelRow[]>(() => [makeEmptyRow()]);
  useTrailingEmptyRow(rows, setRows, {
    isEmpty: isEmptyRow,
    makeEmpty: makeEmptyRow,
  });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [printing, setPrinting] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const focusedRowIdRef = useRef<string | null>(null);

  const paper = useBarcodePrintSettingsStore((s) => s.paper);

  // ─── Reference data ────────────────────────────────────────────────
  const branchId = getActiveBranch();
  const { data: storages } = useQuery({
    queryKey: ["inventory-storages", branchId],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (branchId) params.set("branchId", branchId);
      const { data } = await apiClient.get<
        PaginatedResponse<InventoryStorageOption>
      >(`/inventory/storages?${params}`);
      return data.data;
    },
  });
  const storageNameById = useMemo(
    () => new Map((storages ?? []).map((s) => [s.id, s.name])),
    [storages],
  );

  // Mã chi nhánh in trên tem: đọc từ branch đang chọn; BranchEntity chưa có
  // cột `code` nên tạm fallback "MT" cho tới khi backend bổ sung.
  const { data: myBranches } = useMyBranches();
  const branchCode = useMemo(
    () => myBranches?.find((b) => b.id === branchId)?.code || "MT",
    [myBranches, branchId],
  );

  // ─── Row mutations ─────────────────────────────────────────────────
  const patchRow = useCallback(
    (rowId: string, patch: Partial<BarcodeLabelRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  /** Resolve Kho/Vị trí gợi ý cho một loạt row vừa thêm — một call duy nhất. */
  const resolveRowsLocations = useCallback(
    async (entries: Array<{ rowId: string; itemId: string }>) => {
      if (!entries.length) return;
      const clearLoading = () => {
        const rowIds = new Set(entries.map((e) => e.rowId));
        setRows((prev) =>
          prev.map((r) =>
            rowIds.has(r.rowId) ? { ...r, locationLoading: false } : r,
          ),
        );
      };
      const activeBranch = getActiveBranch();
      if (!activeBranch) {
        clearLoading();
        return;
      }
      try {
        const resolved = await resolveItemLocations(
          entries.map((e) => e.itemId),
          activeBranch,
        );
        const byItemId = new Map(resolved.map((r) => [r.itemId, r]));
        const itemIdByRowId = new Map(entries.map((e) => [e.rowId, e.itemId]));
        setRows((prev) =>
          prev.map((row) => {
            const itemId = itemIdByRowId.get(row.rowId);
            if (!itemId) return row;
            const match = byItemId.get(itemId);
            return {
              ...row,
              storageId: match?.storageId ?? "",
              storageName: storageNameById.get(match?.storageId ?? "") ?? "",
              locationId: match?.locationId ?? "",
              locationCode: match?.locationCode ?? "",
              locationLoading: false,
            };
          }),
        );
      } catch {
        clearLoading();
        toast.warning("Không lấy được Kho/Vị trí gợi ý cho hàng hóa vừa thêm");
      }
    },
    [storageNameById],
  );

  const handleSelectItem = useCallback(
    (rowId: string, item: BarcodeItemOption) => {
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId
            ? {
                ...r,
                itemId: item.id,
                sku: item.code,
                name: item.name,
                unit: item.unit ?? "",
                sellingPrice: Number(item.sellingPrice ?? 0),
                quantity: r.quantity > 0 ? r.quantity : 1,
                locationLoading: true,
              }
            : r,
        ),
      );
      void resolveRowsLocations([{ rowId, itemId: item.id }]);
    },
    [resolveRowsLocations],
  );

  const searchItems = useCallback(
    async (
      query: string,
      page: number,
      pageSize?: number,
    ): Promise<BarcodeItemSearchResult> => {
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<
        PaginatedResponse<BarcodeItemOption>
      >(`/inventory/items?${params}`);
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  /** Thêm các dòng chọn từ dialog "Chọn hàng hóa" (pattern GoodsReceiptFormDialog). */
  const addRowsFromPicker = useCallback(
    (result: ProductSelectResult) => {
      const existing = new Set(
        rows.map((r) => r.itemId).filter(Boolean),
      );
      const fresh: BarcodeLabelRow[] = result.lines
        .filter((s) => s.itemId && !existing.has(s.itemId))
        .map((s) => ({
          rowId: crypto.randomUUID(),
          itemId: s.itemId,
          sku: s.sku,
          name: s.name,
          unit: s.unit ?? "",
          sellingPrice:
            Number(s.unitPrice) > 0
              ? Number(s.unitPrice)
              : Number(s.sellingPrice ?? 0) || 0,
          storageId: "",
          storageName: "",
          locationId: "",
          locationCode: "",
          quantity: s.quantity > 0 ? s.quantity : 1,
          locationLoading: true,
        }));
      if (!fresh.length) return;
      // Chèn trước dòng trống cuối để dòng nhập liệu luôn nằm cuối bảng.
      setRows((prev) => {
        const last = prev[prev.length - 1];
        if (last && isEmptyRow(last)) {
          return [...prev.slice(0, -1), ...fresh, last];
        }
        return [...prev, ...fresh];
      });
      void resolveRowsLocations(
        fresh.map((r) => ({ rowId: r.rowId, itemId: r.itemId })),
      );
    },
    [rows, resolveRowsLocations],
  );

  const handleCopyQuantityDown = useCallback((rowId: string) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.rowId === rowId);
      if (index === -1) return prev;
      const { quantity } = prev[index];
      // Chỉ áp cho các dòng bên dưới đã chọn hàng (bỏ qua dòng nhập liệu trống cuối).
      return prev.map((r, i) => (i > index && r.itemId ? { ...r, quantity } : r));
    });
  }, []);

  const handleDeleteRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.rowId === rowId);
      // Dòng trống cuối là dòng nhập liệu — không xoá.
      if (!row || (isEmptyRow(row) && prev.indexOf(row) === prev.length - 1)) {
        return prev;
      }
      return prev.filter((r) => r.rowId !== rowId);
    });
    if (focusedRowIdRef.current === rowId) focusedRowIdRef.current = null;
  }, []);

  const handleRowFocus = useCallback((rowId: string) => {
    focusedRowIdRef.current = rowId;
  }, []);

  const handleQuantityChange = useCallback(
    (rowId: string, quantity: number) => patchRow(rowId, { quantity }),
    [patchRow],
  );

  const handleSkuTextChange = useCallback(
    (rowId: string, text: string) => patchRow(rowId, { sku: text }),
    [patchRow],
  );

  const handleCancel = useCallback(() => {
    setRows([makeEmptyRow()]);
    setFilters({});
    focusedRowIdRef.current = null;
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "Insert") {
        e.preventDefault();
        focusSkuInput();
        return;
      }
      if (e.key === "F3") {
        // "Tìm kiếm nâng cao" — mở dialog Chọn hàng hóa.
        e.preventDefault();
        setProductPickerOpen(true);
        return;
      }
      if (e.key === "Delete") {
        e.preventDefault();
        setRows((prev) => {
          const filled = prev.filter((r) => r.itemId);
          const target =
            filled.find((r) => r.rowId === focusedRowIdRef.current) ??
            filled[filled.length - 1];
          if (!target) return prev;
          if (focusedRowIdRef.current === target.rowId) {
            focusedRowIdRef.current = null;
          }
          return prev.filter((r) => r.rowId !== target.rowId);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Derived ───────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim());
    if (!active.length) return rows;
    return rows.filter((row) => {
      // Dòng nhập liệu cuối luôn hiển thị.
      if (isEmptyRow(row)) return true;
      return active.every(([key, raw]) => {
        const needle = raw.trim().toLowerCase();
        switch (key) {
          case "stt":
            return true;
          case "sku":
            return row.sku.toLowerCase().includes(needle);
          case "name":
            return row.name.toLowerCase().includes(needle);
          case "unit":
            return row.unit.toLowerCase().includes(needle);
          case "storageName":
            return row.storageName.toLowerCase().includes(needle);
          case "locationCode":
            return row.locationCode.toLowerCase().includes(needle);
          case "sellingPrice": {
            const limit = parseFilterNumber(raw);
            return limit == null || row.sellingPrice <= limit;
          }
          case "quantity": {
            const limit = parseFilterNumber(raw);
            return limit == null || row.quantity <= limit;
          }
          default:
            return true;
        }
      });
    });
  }, [rows, filters]);

  const totalQuantity = useMemo(
    () => rows.reduce((sum, r) => sum + (r.itemId ? r.quantity : 0), 0),
    [rows],
  );

  const previewRow = useMemo(
    () => rows.find((r) => r.itemId) ?? null,
    [rows],
  );

  // ─── Print ─────────────────────────────────────────────────────────
  const handlePrint = useCallback(async () => {
    const printable = rows.filter((r) => r.itemId && r.quantity > 0);
    if (!printable.length) {
      toast.error("Chưa có tem nào để in — thêm hàng hóa và số lượng tem");
      return;
    }
    setPrinting(true);
    try {
      const pdf = renderBarcodeLabelsPdf(printable, {
        paper,
        printedAt: new Date(),
        branchCode,
      });
      await printBarcodeLabels(pdf);
    } finally {
      setPrinting(false);
    }
  }, [rows, paper, branchCode]);

  return (
    <div className="flex min-h-0 w-full flex-1 gap-2.5 overflow-hidden">
      {/* ─── Panel trái: bảng hàng hoá ─────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {/* Tab bar */}
        <div className="flex items-stretch border-b bg-muted/40">
          <button
            type="button"
            className="border-b-2 border-primary bg-background px-5 py-2.5 text-sm font-bold text-primary"
          >
            In tem mã thường
          </button>
          <button
            type="button"
            className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => toast.info("Chưa hỗ trợ in tem mã khuyến mại")}
          >
            In tem mã khuyến mại
          </button>
        </div>

        {/* Bảng */}
        <div className="min-h-0 flex-1">
          <BarcodeLabelGrid
            rows={visibleRows}
            filters={filters}
            onFiltersChange={setFilters}
            searchItems={searchItems}
            onSkuTextChange={handleSkuTextChange}
            onSelectItem={handleSelectItem}
            onQuantityChange={handleQuantityChange}
            onCopyQuantityDown={handleCopyQuantityDown}
            onDeleteRow={handleDeleteRow}
            onRowFocus={handleRowFocus}
            onOpenProductPicker={() => setProductPickerOpen(true)}
          />
        </div>

        <BarcodeShortcutBar />

        {/* Footer tổng */}
        <div className="flex items-center justify-end gap-6 border-t bg-muted/40 px-4 py-2 text-sm font-bold text-foreground">
          <span>Tổng số lượng tem</span>
          <span>{totalQuantity}</span>
        </div>
      </section>

      {/* ─── Sidebar phải: cấu hình in ─────────────────────────────── */}
      <BarcodePrintSidebar
        previewRow={previewRow}
        branchCode={branchCode}
        printing={printing}
        onPrint={handlePrint}
        onCancel={handleCancel}
      />

      {productPickerOpen ? (
        <ProductSelectDialog
          open
          onOpenChange={setProductPickerOpen}
          showQuantityPrice
          defaultUnitPriceSource="sellingPrice"
          defaultQuantity={1}
          onConfirm={addRowsFromPicker}
        />
      ) : null}
    </div>
  );
}
