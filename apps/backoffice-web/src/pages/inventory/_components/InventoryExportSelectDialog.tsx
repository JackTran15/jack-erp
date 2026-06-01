import { AppModal, Button, Input } from "@erp/ui";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useCrudRecords } from "../../../components/crud";
import { PaginationControls } from "../../../components/table/PaginationControls";
import {
  useInventoryProductGroups,
  useInventoryProductItems,
  type ProductGroupRow,
  type ProductVariantRow,
} from "./useInventoryProductGroups";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelectedIds?: Set<string>;
  onConfirm: (allSelectedIds: Set<string>, productIds: string[], standaloneItemIds: string[]) => void;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;
const VARIANT_PAGE_SIZE = 50;

function formatMoney(val: unknown): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}

// ─── Main dialog ───────────────────────────────────────────────────────────

export function InventoryExportSelectDialog({
  open,
  onOpenChange,
  initialSelectedIds,
  onConfirm,
}: Props) {
  const [categoryId, setCategoryId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // product IDs whose all variants are selected (may not yet be loaded)
  const [autoSelectIds, setAutoSelectIds] = useState<Set<string>>(new Set());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => initialSelectedIds ? new Set(initialSelectedIds) : new Set(),
  );

  // Cache loaded variants per productId so we can compute checkbox state
  const variantCache = useRef<Map<string, ProductVariantRow[]>>(new Map());

  const categoriesQuery = useCrudRecords(
    "inventory-item-categories",
    { page: 1, pageSize: 100, sortBy: "name", sortOrder: "asc" },
    true,
  );
  const categories = (categoriesQuery.data?.data ?? []) as Record<string, unknown>[];

  const groupsQuery = useInventoryProductGroups({
    page,
    pageSize,
    search: committedSearch || undefined,
    categoryId: categoryId || undefined,
  });

  const rows = groupsQuery.data?.data ?? [];
  const total = groupsQuery.data?.total ?? 0;

  function commitSearch() {
    setCommittedSearch(searchInput.trim());
    setPage(1);
  }

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleItem = useCallback((id: string, checked: boolean) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleProductCheckChange = useCallback(
    (row: ProductGroupRow, checked: boolean) => {
      const cached = variantCache.current.get(row.id);
      if (!checked) {
        // Deselect: always works from cache
        if (cached?.length) {
          setSelectedItemIds((prev) => {
            const next = new Set(prev);
            cached.forEach((v) => next.delete(v.id));
            return next;
          });
        }
        setAutoSelectIds((prev) => {
          if (!prev.has(row.id)) return prev;
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        return;
      }
      // Check: if cache has data, select now; else mark for full selection without expanding
      if (cached?.length) {
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          cached.forEach((v) => next.add(v.id));
          return next;
        });
      } else {
        setAutoSelectIds((prev) => {
          const next = new Set(prev);
          next.add(row.id);
          return next;
        });
      }
    },
    [],
  );

  // Callback from VariantRowsWithCache when variants first load for an auto-select product
  const onVariantsAutoLoaded = useCallback(
    (productId: string, variants: ProductVariantRow[]) => {
      setAutoSelectIds((prev) => {
        if (!prev.has(productId)) return prev;
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        variants.forEach((v) => next.add(v.id));
        return next;
      });
    },
    [],
  );

  // Derive product checkbox state from cache
  const getProductCheckState = useCallback(
    (row: ProductGroupRow): { checked: boolean; indeterminate: boolean } => {
      if (autoSelectIds.has(row.id)) return { checked: true, indeterminate: false };
      const cached = variantCache.current.get(row.id);
      if (!cached || cached.length === 0) return { checked: false, indeterminate: false };
      const selectedCount = cached.filter((v) => selectedItemIds.has(v.id)).length;
      if (selectedCount === 0) return { checked: false, indeterminate: false };
      if (selectedCount === cached.length) return { checked: true, indeterminate: false };
      return { checked: false, indeterminate: true };
    },
    [selectedItemIds, autoSelectIds],
  );

  // Header "select all" state — based on current-page product rows
  const productRows = rows.filter((r) => r.type === "product");
  const allPageChecked =
    productRows.length > 0 &&
    productRows.every((r) => {
      const { checked } = getProductCheckState(r);
      return checked;
    });
  const somePageChecked =
    !allPageChecked &&
    productRows.some((r) => {
      const { checked, indeterminate } = getProductCheckState(r);
      return checked || indeterminate;
    });

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        // Deselect all on current page
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          rows.forEach((row) => {
            if (row.type === "orphan") {
              next.delete(row.id);
            } else {
              const cached = variantCache.current.get(row.id);
              cached?.forEach((v) => next.delete(v.id));
            }
          });
          return next;
        });
        setAutoSelectIds((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set(prev);
          rows.forEach((r) => next.delete(r.id));
          return next;
        });
        return;
      }
      // Select all: orphans direct, products expand + autoselect
      rows.forEach((row) => {
        if (row.type === "orphan") {
          setSelectedItemIds((prev) => {
            const next = new Set(prev);
            next.add(row.id);
            return next;
          });
        } else {
          handleProductCheckChange(row, true);
        }
      });
    },
    [rows, handleProductCheckChange],
  );

  // Extra count for auto-selected products whose variants haven't been loaded yet
  const autoSelectExtraCount = useMemo(() => {
    let count = 0;
    for (const productId of autoSelectIds) {
      if (!variantCache.current.has(productId)) {
        const row = rows.find((r) => r.id === productId);
        if (row) count += row.itemCount;
      }
    }
    return count;
  }, [autoSelectIds, rows]);

  const totalSelectedCount = selectedItemIds.size + autoSelectExtraCount;

  const selectedProductCount = useMemo(() => {
    const productIds = new Set<string>(autoSelectIds);
    variantCache.current.forEach((variants, productId) => {
      if (!autoSelectIds.has(productId) && variants.some((v) => selectedItemIds.has(v.id))) {
        productIds.add(productId);
      }
    });
    return productIds.size;
  }, [selectedItemIds, autoSelectIds]);

  function handleExport() {
    // Items directly selected (orphans + individually checked variants from expanded rows)
    // minus any that already belong to a fully-selected product (avoid duplication)
    const cachedProductItemIds = new Set<string>();
    for (const productId of autoSelectIds) {
      variantCache.current.get(productId)?.forEach((v) => cachedProductItemIds.add(v.id));
    }
    const standaloneItemIds = [...selectedItemIds].filter((id) => !cachedProductItemIds.has(id));

    onOpenChange(false);
    onConfirm(selectedItemIds, [...autoSelectIds], standaloneItemIds);
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      preventOutsideClose
      title="Chọn hàng hóa"
      description={null}
      defaultWidth={960}
      defaultHeight={660}
      minWidth={640}
      minHeight={420}
      bodyClassName="overflow-hidden flex flex-col gap-3"
      showFooter
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Đã chọn{" "}
            <span className="font-semibold text-foreground">{selectedProductCount}</span>{" "}
            mẫu mã (
            <span className="font-semibold text-foreground">{totalSelectedCount}</span>{" "}
            hàng hóa).
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button
              disabled={totalSelectedCount === 0}
              onClick={handleExport}
            >
              Xuất khẩu ({totalSelectedCount})
            </Button>
          </div>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex shrink-0 items-center gap-2">
        <select
          className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
          aria-label="Lọc theo nhóm hàng hóa"
        >
          <option value="">— Tất cả nhóm —</option>
          {categories.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {String(c.name)}
            </option>
          ))}
        </select>
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitSearch(); }}
          placeholder="Nhập mã SKU, tên hàng hóa"
          className="h-9 flex-1"
        />
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1.5" onClick={commitSearch}>
          <Search className="h-4 w-4" aria-hidden />
          Tìm kiếm
        </Button>
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả trên trang"
                    checked={allPageChecked}
                    ref={(el) => { if (el) el.indeterminate = somePageChecked; }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-3 py-2 text-left font-medium">Mã SKU</th>
                <th className="px-3 py-2 text-left font-medium">Tên hàng hóa</th>
                <th className="px-3 py-2 text-left font-medium">Nhóm hàng hóa</th>
                <th className="px-3 py-2 text-left font-medium">Đơn vị tính</th>
                <th className="px-3 py-2 text-left font-medium">Thương hiệu</th>
                <th className="px-3 py-2 text-right font-medium">Giá mua TB</th>
                <th className="px-3 py-2 text-right font-medium">Giá bán TB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groupsQuery.isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Đang tải…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Không có hàng hóa phù hợp.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <ProductOrOrphanRow
                    key={row.id}
                    row={row}
                    expanded={expandedIds.has(row.id)}
                    autoSelect={autoSelectIds.has(row.id)}
                    selectedItemIds={selectedItemIds}
                    getProductCheckState={getProductCheckState}
                    onToggleExpand={toggleExpand}
                    onProductCheckChange={handleProductCheckChange}
                    onToggleItem={toggleItem}
                    onVariantsAutoLoaded={onVariantsAutoLoaded}
                    variantCache={variantCache}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </div>
    </AppModal>
  );
}

// ─── Product / orphan row ──────────────────────────────────────────────────

interface ProductOrOrphanRowProps {
  row: ProductGroupRow;
  expanded: boolean;
  autoSelect: boolean;
  selectedItemIds: Set<string>;
  getProductCheckState: (row: ProductGroupRow) => { checked: boolean; indeterminate: boolean };
  onToggleExpand: (id: string) => void;
  onProductCheckChange: (row: ProductGroupRow, checked: boolean) => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onVariantsAutoLoaded: (productId: string, variants: ProductVariantRow[]) => void;
  variantCache: { current: Map<string, ProductVariantRow[]> };
}

function ProductOrOrphanRow({
  row,
  expanded,
  autoSelect,
  selectedItemIds,
  getProductCheckState,
  onToggleExpand,
  onProductCheckChange,
  onToggleItem,
  onVariantsAutoLoaded,
  variantCache,
}: ProductOrOrphanRowProps) {
  if (row.type === "orphan") {
    return (
      <tr className="hover:bg-muted/40">
        <td className="w-8 px-2 py-2 text-muted-foreground/40 text-center select-none">—</td>
        <td className="w-8 px-2 py-2">
          <input
            type="checkbox"
            aria-label={`Chọn ${row.name}`}
            checked={selectedItemIds.has(row.id)}
            onChange={(e) => onToggleItem(row.id, e.target.checked)}
          />
        </td>
        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
        <td className="px-3 py-2">{row.name}</td>
        <td className="px-3 py-2 text-muted-foreground">{row.categoryName ?? "—"}</td>
        <td className="px-3 py-2 text-muted-foreground">{row.unit}</td>
        <td className="px-3 py-2 text-muted-foreground">{row.brand ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.purchasePrice)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.sellingPrice)}</td>
      </tr>
    );
  }

  const { checked, indeterminate } = getProductCheckState(row);

  return (
    <>
      <tr className="bg-background hover:bg-muted/20 font-medium">
        <td className="w-8 px-2 py-2 text-center">
          <button
            type="button"
            className="flex items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => onToggleExpand(row.id)}
            aria-label={expanded ? "Thu gọn" : "Mở rộng"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="w-8 px-2 py-2">
          <input
            type="checkbox"
            aria-label={`Chọn tất cả ${row.name}`}
            checked={checked}
            ref={(el) => { if (el) el.indeterminate = indeterminate; }}
            onChange={(e) => onProductCheckChange(row, e.target.checked)}
          />
        </td>
        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
        <td className="px-3 py-2">
          {row.name}
          {row.itemCount > 0 && (
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
              {row.itemCount}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-muted-foreground font-normal">{row.categoryName ?? "—"}</td>
        <td className="px-3 py-2 text-muted-foreground font-normal">{row.unit}</td>
        <td className="px-3 py-2 text-muted-foreground font-normal">{row.brand ?? "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums font-normal">{formatMoney(row.purchasePrice)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-normal">{formatMoney(row.sellingPrice)}</td>
      </tr>

      {expanded && (
        <VariantRowsWithCache
          productId={row.id}
          autoSelect={autoSelect}
          selectedItemIds={selectedItemIds}
          onToggleItem={onToggleItem}
          onVariantsAutoLoaded={onVariantsAutoLoaded}
          variantCache={variantCache}
        />
      )}
    </>
  );
}

// ─── Variant rows (lazy-loaded, writes to cache) ──────────────────────────

interface VariantRowsWithCacheProps {
  productId: string;
  autoSelect: boolean;
  selectedItemIds: Set<string>;
  onToggleItem: (id: string, checked: boolean) => void;
  onVariantsAutoLoaded: (productId: string, variants: ProductVariantRow[]) => void;
  variantCache: { current: Map<string, ProductVariantRow[]> };
}

function VariantRowsWithCache({
  productId,
  autoSelect,
  selectedItemIds,
  onToggleItem,
  onVariantsAutoLoaded,
  variantCache,
}: VariantRowsWithCacheProps) {
  const [page, setPage] = useState(1);

  const query = useInventoryProductItems(
    { productId, page, pageSize: VARIANT_PAGE_SIZE },
    true,
  );

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? 0;

  // Write to cache
  if (rows.length > 0) {
    const existing = variantCache.current.get(productId) ?? [];
    const offset = (page - 1) * VARIANT_PAGE_SIZE;
    const merged = [...existing];
    rows.forEach((v, i) => { merged[offset + i] = v; });
    variantCache.current.set(productId, merged.filter(Boolean));
  }

  // Auto-select on first load
  useEffect(() => {
    if (autoSelect && rows.length > 0 && !query.isLoading) {
      onVariantsAutoLoaded(productId, rows);
    }
  // Run once per productId when first page of data arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelect, query.isLoading, productId]);

  if (query.isLoading) {
    return (
      <tr>
        <td colSpan={9} className="py-2 pl-10 text-xs text-muted-foreground">Đang tải…</td>
      </tr>
    );
  }

  return (
    <>
      {rows.map((v) => (
        <tr key={v.id} className="bg-muted/20 hover:bg-muted/40">
          <td className="w-8 px-2" />
          <td className="w-8 px-2 py-1.5">
            <input
              type="checkbox"
              aria-label={`Chọn ${v.name}`}
              checked={selectedItemIds.has(v.id)}
              onChange={(e) => onToggleItem(v.id, e.target.checked)}
            />
          </td>
          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground pl-6">{v.code}</td>
          <td className="px-3 py-1.5 text-sm">
            {v.name}
            {v.variantLabel ? (
              <span className="ml-1.5 text-xs text-muted-foreground">({v.variantLabel})</span>
            ) : null}
          </td>
          <td className="px-3 py-1.5 text-sm text-muted-foreground">{v.categoryName ?? "—"}</td>
          <td className="px-3 py-1.5 text-sm text-muted-foreground">{v.unit}</td>
          <td className="px-3 py-1.5 text-sm text-muted-foreground">{v.brand ?? "—"}</td>
          <td className="px-3 py-1.5 text-right text-sm tabular-nums">{formatMoney(v.purchasePrice)}</td>
          <td className="px-3 py-1.5 text-right text-sm tabular-nums">{formatMoney(v.sellingPrice)}</td>
        </tr>
      ))}

      {total > VARIANT_PAGE_SIZE && (
        <tr>
          <td colSpan={9} className="px-10 py-1">
            <PaginationControls
              page={page}
              pageSize={VARIANT_PAGE_SIZE}
              total={total}
              onPageChange={setPage}
              pageSizeOptions={[VARIANT_PAGE_SIZE]}
            />
          </td>
        </tr>
      )}
    </>
  );
}
