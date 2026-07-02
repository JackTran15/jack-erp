import { AppModal, Button, Input, MoneyInput } from "@erp/ui";
import { ChevronDown, ChevronRight, Search, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TreeSelectInput } from "../../forms/TreeSelectInput";
import { PaginationControls } from "../../table/PaginationControls";
import { QuickEntryDialog } from "./QuickEntryDialog";
import {
  fetchProductVariants,
  useProductGroups,
  useProductVariants,
  type ProductGroupRow,
  type ProductVariantRow,
} from "./useProductSearch";

export interface SelectedProduct {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  categoryName: string | null;
  purchasePrice: number;
  sellingPrice: number;
  variantLabel: string | null;
}

export interface SelectedLine extends SelectedProduct {
  quantity: number;
  unitPrice: number;
}

export interface ProductSelectResult {
  /** Full line-level data (qty + price) for every selected item, incl. resolved fully-selected products. */
  lines: SelectedLine[];
  /** Product ids whose all variants are selected. */
  fullySelectedProductIds: string[];
  /** Item ids selected but not part of a fully-selected product. */
  standaloneItemIds: string[];
  /** Every directly-selected item id (excludes not-yet-loaded auto-selected variants). */
  allSelectedItemIds: string[];
}

type UnitPriceSource = "purchasePrice" | "sellingPrice" | "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  confirmLabel?: string;
  categoryFilter?: boolean;
  initialSelectedIds?: Set<string>;
  /** Show editable quantity + unit price columns and the "Nhập nhanh" action. */
  showQuantityPrice?: boolean;
  /** Resolve collapsed full-product selections into rich item lines on confirm. */
  resolveSelectedLines?: boolean;
  defaultUnitPriceSource?: UnitPriceSource;
  defaultQuantity?: number;
  onConfirm: (result: ProductSelectResult) => void;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;
const VARIANT_PAGE_SIZE = 50;

interface LineValue {
  quantity?: number;
  unitPrice?: number;
}

function formatMoney(val: unknown): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("vi-VN") + " ₫";
}

function orphanToSelected(row: ProductGroupRow): SelectedProduct {
  return {
    itemId: row.id,
    sku: row.code,
    name: row.name,
    unit: row.unit,
    categoryName: row.categoryName,
    purchasePrice: row.purchasePrice,
    sellingPrice: row.sellingPrice,
    variantLabel: null,
  };
}

function variantToSelected(v: ProductVariantRow): SelectedProduct {
  return {
    itemId: v.id,
    sku: v.code,
    name: v.name,
    unit: v.unit,
    categoryName: v.categoryName,
    purchasePrice: v.purchasePrice,
    sellingPrice: v.sellingPrice,
    variantLabel: v.variantLabel,
  };
}

// ─── Main dialog ───────────────────────────────────────────────────────────

export function ProductSelectDialog({
  open,
  onOpenChange,
  title = "Chọn hàng hóa",
  confirmLabel = "Chọn",
  categoryFilter = true,
  initialSelectedIds,
  showQuantityPrice = false,
  defaultUnitPriceSource = "none",
  defaultQuantity = 1,
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
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() =>
    initialSelectedIds ? new Set(initialSelectedIds) : new Set(),
  );
  // Per-item quantity/price overrides + a "Nhập nhanh" bulk value applied to all
  const [lineValues, setLineValues] = useState<Map<string, LineValue>>(
    new Map(),
  );
  const [bulkValue, setBulkValue] = useState<LineValue | null>(null);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  // Product id whose per-group "Nhập nhanh" dialog is open, or null.
  const [quickEntryGroup, setQuickEntryGroup] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Cache loaded variants per productId so we can compute checkbox state
  const variantCache = useRef<Map<string, ProductVariantRow[]>>(new Map());
  // Accumulate full data for every item rendered, so confirm can return rich rows
  const itemDataById = useRef<Map<string, SelectedProduct>>(new Map());

  const groupsQuery = useProductGroups({
    page,
    pageSize,
    search: committedSearch || undefined,
    categoryId: categoryId || undefined,
  });

  const rows = groupsQuery.data?.data ?? [];
  const total = groupsQuery.data?.total ?? 0;

  // Cache orphan item data as rows render
  rows.forEach((row) => {
    if (row.type === "orphan")
      itemDataById.current.set(row.id, orphanToSelected(row));
  });

  const defaultUnitPrice = useCallback(
    (data: SelectedProduct): number => {
      if (defaultUnitPriceSource === "purchasePrice")
        return data.purchasePrice ?? 0;
      if (defaultUnitPriceSource === "sellingPrice")
        return data.sellingPrice ?? 0;
      return 0;
    },
    [defaultUnitPriceSource],
  );

  const getQty = useCallback(
    (id: string): number =>
      lineValues.get(id)?.quantity ?? bulkValue?.quantity ?? defaultQuantity,
    [lineValues, bulkValue, defaultQuantity],
  );

  const getPrice = useCallback(
    (id: string, data: SelectedProduct): number =>
      lineValues.get(id)?.unitPrice ??
      bulkValue?.unitPrice ??
      defaultUnitPrice(data),
    [lineValues, bulkValue, defaultUnitPrice],
  );

  const setQty = useCallback((id: string, quantity: number) => {
    setLineValues((prev) => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), quantity });
      return next;
    });
  }, []);

  const setPrice = useCallback((id: string, unitPrice: number) => {
    setLineValues((prev) => {
      const next = new Map(prev);
      next.set(id, { ...next.get(id), unitPrice });
      return next;
    });
  }, []);

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
      if (autoSelectIds.has(row.id))
        return { checked: true, indeterminate: false };
      const cached = variantCache.current.get(row.id);
      if (!cached || cached.length === 0)
        return { checked: false, indeterminate: false };
      const selectedCount = cached.filter((v) =>
        selectedItemIds.has(v.id),
      ).length;
      if (selectedCount === 0) return { checked: false, indeterminate: false };
      if (selectedCount === cached.length)
        return { checked: true, indeterminate: false };
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
      if (
        !autoSelectIds.has(productId) &&
        variants.some((v) => selectedItemIds.has(v.id))
      ) {
        productIds.add(productId);
      }
    });
    return productIds.size;
  }, [selectedItemIds, autoSelectIds]);

  // "Nhập nhanh" — set quantity + price for every selected item (uniform override)
  function applyQuickEntry(quantity: number, unitPrice: number) {
    setBulkValue({ quantity, unitPrice });
    setLineValues(new Map());
  }

  // Per-group "Nhập nhanh" — set quantity + price only for the SELECTED variants
  // of one product group (others untouched). Resolves an auto-selected (collapsed)
  // group's variants first so its items can be addressed by id.
  async function applyGroupQuickEntry(
    productId: string,
    quantity: number,
    unitPrice: number,
  ) {
    let variants = variantCache.current.get(productId) ?? [];
    if (autoSelectIds.has(productId) && variants.length === 0) {
      variants = await ensureAllVariants(productId);
    }
    const ids = variants
      .map((v) => v.id)
      .filter((id) => selectedItemIds.has(id) || autoSelectIds.has(productId));
    if (ids.length === 0) return;
    setLineValues((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.set(id, { quantity, unitPrice }));
      return next;
    });
  }

  // Fetch all variant pages of a product (used to resolve auto-selected products on confirm)
  async function ensureAllVariants(
    productId: string,
  ): Promise<ProductVariantRow[]> {
    const first = await fetchProductVariants({
      productId,
      page: 1,
      pageSize: VARIANT_PAGE_SIZE,
    });
    let all = [...first.data];
    let p = 2;
    while (all.length < first.total) {
      const next = await fetchProductVariants({
        productId,
        page: p,
        pageSize: VARIANT_PAGE_SIZE,
      });
      if (next.data.length === 0) break;
      all = all.concat(next.data);
      p += 1;
    }
    variantCache.current.set(productId, all);
    all.forEach((v) => itemDataById.current.set(v.id, variantToSelected(v)));
    return all;
  }

  async function handleConfirm() {
    const fullySelectedProductIds = [...autoSelectIds];
    const cachedProductItemIds = new Set<string>();
    for (const productId of autoSelectIds) {
      variantCache.current
        .get(productId)
        ?.forEach((v) => cachedProductItemIds.add(v.id));
    }
    const standaloneItemIds = [...selectedItemIds].filter(
      (id) => !cachedProductItemIds.has(id),
    );
    const allSelectedItemIds = [...selectedItemIds];

    // Resolve every selected item to full line data. A checked collapsed product
    // represents all of its variants, even when the caller only needs item ids.
    const lineItemIds = new Set<string>(selectedItemIds);
    if (autoSelectIds.size > 0) {
      setResolving(true);
      try {
        for (const productId of autoSelectIds) {
          const variants = await ensureAllVariants(productId);
          variants.forEach((v) => lineItemIds.add(v.id));
        }
      } finally {
        setResolving(false);
      }
    }

    const lines: SelectedLine[] = [];
    for (const id of lineItemIds) {
      const data = itemDataById.current.get(id);
      if (!data) continue;
      lines.push({
        ...data,
        quantity: getQty(id),
        unitPrice: getPrice(id, data),
      });
    }

    onOpenChange(false);
    onConfirm({
      lines,
      fullySelectedProductIds,
      standaloneItemIds,
      allSelectedItemIds,
    });
  }

  const colCount = showQuantityPrice ? 10 : 8;

  return (
    <>
      <AppModal
        open={open}
        onOpenChange={onOpenChange}
        preventOutsideClose
        title={title}
        description={null}
        defaultWidth={showQuantityPrice ? 1100 : 960}
        defaultHeight={660}
        minWidth={640}
        minHeight={420}
        bodyClassName="overflow-hidden flex flex-col gap-3"
        showFooter
        footer={
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Đã chọn{" "}
              <span className="font-semibold text-foreground">
                {selectedProductCount}
              </span>{" "}
              mẫu mã (
              <span className="font-semibold text-foreground">
                {totalSelectedCount}
              </span>{" "}
              hàng hóa).
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={resolving}
              >
                Hủy bỏ
              </Button>
              <Button
                disabled={totalSelectedCount === 0 || resolving}
                onClick={handleConfirm}
              >
                {resolving ? "Đang xử lý…" : confirmLabel}
              </Button>
            </div>
          </div>
        }
      >
        {/* Filters */}
        <div className="flex shrink-0 items-center gap-2">
          {categoryFilter && (
            <div className="w-[260px]">
              <TreeSelectInput
                inputId="product-select-category"
                placeholder="Tất cả nhóm"
                value={categoryId}
                onChange={(selectedId) => {
                  setCategoryId(selectedId);
                  setPage(1);
                }}
                entityKey="inventory-item-categories"
              />
            </div>
          )}
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSearch();
            }}
            placeholder="Nhập mã SKU, tên hàng hóa"
            className="h-9 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            onClick={commitSearch}
          >
            <Search className="h-4 w-4" aria-hidden />
            Tìm kiếm
          </Button>
          {showQuantityPrice && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5"
              disabled={totalSelectedCount === 0}
              onClick={() => setQuickEntryOpen(true)}
            >
              <Zap className="h-4 w-4" aria-hidden />
              Nhập nhanh
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground [&_th]:bg-muted">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả trên trang"
                      checked={allPageChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageChecked;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium">Mã SKU</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Tên hàng hóa
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Nhóm hàng hóa
                  </th>
                  <th className="px-3 py-2 text-left font-medium">
                    Đơn vị tính
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Giá mua TB
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Giá bán TB
                  </th>
                  {showQuantityPrice && (
                    <>
                      <th className="px-3 py-2 text-right font-medium">
                        Số lượng
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Đơn giá
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groupsQuery.isLoading ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Đang tải…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Không có hàng hóa phù hợp.
                    </td>
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
                      itemDataById={itemDataById}
                      showQuantityPrice={showQuantityPrice}
                      getQty={getQty}
                      getPrice={getPrice}
                      setQty={setQty}
                      setPrice={setPrice}
                      onGroupQuickEntry={setQuickEntryGroup}
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
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </div>
      </AppModal>
      {quickEntryOpen && (
        <QuickEntryDialog
          open
          onOpenChange={setQuickEntryOpen}
          onApply={applyQuickEntry}
        />
      )}
      {quickEntryGroup && (
        <QuickEntryDialog
          open
          title="Nhập nhanh cho hàng đã chọn trong nhóm"
          onOpenChange={() => setQuickEntryGroup(null)}
          onApply={(q, p) => {
            void applyGroupQuickEntry(quickEntryGroup, q, p);
            setQuickEntryGroup(null);
          }}
        />
      )}
    </>
  );
}

// ─── Product / orphan row ──────────────────────────────────────────────────

interface RowSharedProps {
  selectedItemIds: Set<string>;
  onToggleItem: (id: string, checked: boolean) => void;
  showQuantityPrice: boolean;
  getQty: (id: string) => number;
  getPrice: (id: string, data: SelectedProduct) => number;
  setQty: (id: string, quantity: number) => void;
  setPrice: (id: string, unitPrice: number) => void;
}

interface ProductOrOrphanRowProps extends RowSharedProps {
  row: ProductGroupRow;
  expanded: boolean;
  autoSelect: boolean;
  getProductCheckState: (row: ProductGroupRow) => {
    checked: boolean;
    indeterminate: boolean;
  };
  onToggleExpand: (id: string) => void;
  onProductCheckChange: (row: ProductGroupRow, checked: boolean) => void;
  onVariantsAutoLoaded: (
    productId: string,
    variants: ProductVariantRow[],
  ) => void;
  /** Open the per-group "Nhập nhanh" dialog for this product id. */
  onGroupQuickEntry: (productId: string) => void;
  variantCache: { current: Map<string, ProductVariantRow[]> };
  itemDataById: { current: Map<string, SelectedProduct> };
}

function QtyPriceCells({
  id,
  data,
  selected,
  getQty,
  getPrice,
  setQty,
  setPrice,
}: {
  id: string;
  data: SelectedProduct;
  selected: boolean;
  getQty: (id: string) => number;
  getPrice: (id: string, data: SelectedProduct) => number;
  setQty: (id: string, quantity: number) => void;
  setPrice: (id: string, unitPrice: number) => void;
}) {
  if (!selected) {
    return (
      <>
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
      </>
    );
  }
  return (
    <>
      <td className="px-2 py-1.5 text-right">
        <MoneyInput
          value={getQty(id)}
          onChange={(v) => setQty(id, v === "" ? 0 : v)}
          className="h-7 w-20"
          aria-label={`Số lượng ${data.sku}`}
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <MoneyInput
          value={getPrice(id, data)}
          onChange={(v) => setPrice(id, v === "" ? 0 : v)}
          className="h-7 w-28"
          aria-label={`Đơn giá ${data.sku}`}
        />
      </td>
    </>
  );
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
  onGroupQuickEntry,
  variantCache,
  itemDataById,
  showQuantityPrice,
  getQty,
  getPrice,
  setQty,
  setPrice,
}: ProductOrOrphanRowProps) {
  if (row.type === "orphan") {
    return (
      <tr className="hover:bg-muted/40">
        <td className="w-8 px-2 py-2 text-muted-foreground/40 text-center select-none">
          —
        </td>
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
        <td className="px-3 py-2 text-muted-foreground">
          {row.categoryName ?? "—"}
        </td>
        <td className="px-3 py-2 text-muted-foreground">{row.unit}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(row.purchasePrice)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(row.sellingPrice)}
        </td>
        {showQuantityPrice && (
          <QtyPriceCells
            id={row.id}
            data={orphanToSelected(row)}
            selected={selectedItemIds.has(row.id)}
            getQty={getQty}
            getPrice={getPrice}
            setQty={setQty}
            setPrice={setPrice}
          />
        )}
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
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="w-8 px-2 py-2">
          <input
            type="checkbox"
            aria-label={`Chọn tất cả ${row.name}`}
            checked={checked}
            ref={(el) => {
              if (el) el.indeterminate = indeterminate;
            }}
            onChange={(e) => onProductCheckChange(row, e.target.checked)}
          />
        </td>
        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
        <td className="px-3 py-2">
          {row.name}
          {row.itemCount > 0 && (
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
              {row.itemCount.toLocaleString("vi-VN")} hàng hóa
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-muted-foreground font-normal">
          {row.categoryName ?? "—"}
        </td>
        <td className="px-3 py-2 text-muted-foreground font-normal">
          {row.unit}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-normal">
          {formatMoney(row.purchasePrice)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-normal">
          {formatMoney(row.sellingPrice)}
        </td>
        {showQuantityPrice && (
          <td colSpan={2} className="px-3 py-2 text-right">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              onClick={() => onGroupQuickEntry(row.id)}
            >
              <Zap className="h-3.5 w-3.5" aria-hidden />
              Nhập nhanh
            </button>
          </td>
        )}
      </tr>

      {expanded && (
        <VariantRowsWithCache
          productId={row.id}
          autoSelect={autoSelect}
          selectedItemIds={selectedItemIds}
          onToggleItem={onToggleItem}
          onVariantsAutoLoaded={onVariantsAutoLoaded}
          variantCache={variantCache}
          itemDataById={itemDataById}
          showQuantityPrice={showQuantityPrice}
          getQty={getQty}
          getPrice={getPrice}
          setQty={setQty}
          setPrice={setPrice}
        />
      )}
    </>
  );
}

// ─── Variant rows (lazy-loaded, writes to cache) ──────────────────────────

interface VariantRowsWithCacheProps extends RowSharedProps {
  productId: string;
  autoSelect: boolean;
  onVariantsAutoLoaded: (
    productId: string,
    variants: ProductVariantRow[],
  ) => void;
  variantCache: { current: Map<string, ProductVariantRow[]> };
  itemDataById: { current: Map<string, SelectedProduct> };
}

function VariantRowsWithCache({
  productId,
  autoSelect,
  selectedItemIds,
  onToggleItem,
  onVariantsAutoLoaded,
  variantCache,
  itemDataById,
  showQuantityPrice,
  getQty,
  getPrice,
  setQty,
  setPrice,
}: VariantRowsWithCacheProps) {
  const [page, setPage] = useState(1);

  const query = useProductVariants(
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
    rows.forEach((v, i) => {
      merged[offset + i] = v;
    });
    variantCache.current.set(productId, merged.filter(Boolean));
    rows.forEach((v) => itemDataById.current.set(v.id, variantToSelected(v)));
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
        <td
          colSpan={showQuantityPrice ? 10 : 8}
          className="py-2 pl-10 text-xs text-muted-foreground"
        >
          Đang tải…
        </td>
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
          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground pl-6">
            {v.code}
          </td>
          <td className="px-3 py-1.5 text-sm">
            {v.name}
            {v.variantLabel ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({v.variantLabel})
              </span>
            ) : null}
          </td>
          <td className="px-3 py-1.5 text-sm text-muted-foreground">
            {v.categoryName ?? "—"}
          </td>
          <td className="px-3 py-1.5 text-sm text-muted-foreground">
            {v.unit}
          </td>
          <td className="px-3 py-1.5 text-right text-sm tabular-nums">
            {formatMoney(v.purchasePrice)}
          </td>
          <td className="px-3 py-1.5 text-right text-sm tabular-nums">
            {formatMoney(v.sellingPrice)}
          </td>
          {showQuantityPrice && (
            <QtyPriceCells
              id={v.id}
              data={variantToSelected(v)}
              selected={selectedItemIds.has(v.id)}
              getQty={getQty}
              getPrice={getPrice}
              setQty={setQty}
              setPrice={setPrice}
            />
          )}
        </tr>
      ))}

      {total > VARIANT_PAGE_SIZE && (
        <tr>
          <td colSpan={showQuantityPrice ? 10 : 8} className="px-10 py-1">
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
