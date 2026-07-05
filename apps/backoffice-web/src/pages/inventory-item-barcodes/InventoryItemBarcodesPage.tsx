import { Button } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, HelpCircle, LayoutGrid, Wrench } from "lucide-react";
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
import {
  isEmptyRow,
  makeEmptyRow,
  type BarcodeLabelRow,
} from "./_lib/barcode-label-row.type";
import { isValidEan13 } from "./_lib/render-barcode-svg";
import { renderBarcodeLabelsHtml } from "./_lib/render-barcode-labels-html";
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
  const [scanMode, setScanMode] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const focusedRowIdRef = useRef<string | null>(null);

  const standard = useBarcodePrintSettingsStore((s) => s.standard);
  const showUnit = useBarcodePrintSettingsStore((s) => s.showUnit);
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

  const handleScanSubmit = useCallback(
    async (rowId: string, code: string) => {
      try {
        const { data } = await apiClient.get<{
          itemId: string;
          item: BarcodeItemOption;
        }>(`/inventory/barcodes/lookup?code=${encodeURIComponent(code)}`);
        handleSelectItem(rowId, { ...data.item, id: data.itemId });
      } catch {
        toast.info(`Không tìm thấy mã vạch "${code}" — thử tìm theo mã hoặc tên hàng`);
      }
    },
    [handleSelectItem],
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

  const handleCopyRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const source = prev.find((r) => r.rowId === rowId);
      if (!source || !source.itemId) return prev;
      const index = prev.findIndex((r) => r.rowId === rowId);
      const clone = { ...source, rowId: crypto.randomUUID() };
      return [...prev.slice(0, index + 1), clone, ...prev.slice(index + 1)];
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
    if (standard === "EAN13") {
      const invalid = printable.filter((r) => !isValidEan13(r.sku));
      if (invalid.length) {
        toast.warning(
          `${invalid.length} mã không hợp lệ chuẩn EAN-13, sẽ in bằng Code 128`,
        );
      }
    }
    setPrinting(true);
    try {
      const html = renderBarcodeLabelsHtml(printable, {
        standard,
        showUnit,
        paper,
      });
      await printBarcodeLabels(html);
    } finally {
      setPrinting(false);
    }
  }, [rows, standard, showUnit, paper]);

  return (
    <div className="flex min-h-0 w-full flex-1 gap-2.5 overflow-hidden">
      {/* ─── Panel trái: bảng hàng hoá ─────────────────────────────── */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        {/* Tab bar + link hướng dẫn */}
        <div className="flex items-stretch justify-between border-b bg-muted/40">
          <div className="flex">
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
          <div className="flex items-center gap-1.5 px-4 text-sm text-foreground">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span>Xem hướng dẫn in tem</span>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => toast.info("Tài liệu hướng dẫn chưa sẵn sàng")}
            >
              tại đây
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-primary"
              checked={scanMode}
              onChange={(e) => setScanMode(e.target.checked)}
            />
            Quét mã vạch để tìm kiếm hàng hóa
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              onClick={() => toast.info("Chưa hỗ trợ chọn bảng giá")}
            >
              <LayoutGrid className="h-4 w-4" />
              Chọn bảng giá
            </button>
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 border-primary text-primary"
              onClick={() => toast.info("Chưa có tiện ích khả dụng")}
            >
              <Wrench className="h-4 w-4" />
              Tiện ích
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
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
            onScanSubmit={handleScanSubmit}
            scanMode={scanMode}
            onQuantityChange={handleQuantityChange}
            onCopyRow={handleCopyRow}
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
