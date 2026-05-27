import { useEffect, useMemo, useState } from "react";
import { cn } from "@erp/ui";

import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosToggle } from "@erp/pos/components/common/PosToggle/PosToggle";
import { ProductHeaderInfo } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/ProductVariantSelectionModal/ProductHeaderInfo/ProductHeaderInfo";
import { VariantFilterChips } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/ProductVariantSelectionModal/VariantFilterChips/VariantFilterChips";
import {
  VariantTable,
  type VariantSelectState,
} from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/ProductVariantSelectionModal/VariantTable/VariantTable";
import { useCatalogProductDetailQuery } from "@erp/pos/hooks/react-query/use-query-catalog";
import type { VariantSelection } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-variant-selection";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import type { VariantDialogTarget } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface ProductVariantSelectionModalProps {
  open: boolean;
  target: VariantDialogTarget | null;
  onClose: () => void;
  /** Thêm các biến thể đã chọn vào giỏ (hook tự đóng dialog + focus lại search). */
  onConfirm: (selections: VariantSelection[]) => void;
}

const FOOTER_LABEL = "Trừ số lượng hàng hóa khách đặt vào tồn kho";

const confirmBtn = cn(
  "inline-flex h-10 items-center justify-center rounded-lg bg-[#6366F1] px-6 text-[14px] font-semibold text-white transition-colors",
  "hover:bg-[#4F46E5] active:bg-[#4338CA]",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
  "disabled:cursor-not-allowed disabled:bg-[#C7D2FE]",
);

const closeBtn = cn(
  "inline-flex h-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-6 text-[14px] font-semibold text-[#0F172A]",
  "transition-colors hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9]",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
);

/**
 * Dialog chọn biến thể (phong cách MISA): header info + chip lọc theo thuộc
 * tính + bảng biến thể (chọn nhiều dòng, nhập SL từng dòng) + footer toggle
 * trừ tồn (chưa nối logic) và 2 nút. Mở khi click product card / chọn từ search.
 */
export function ProductVariantSelectionModal({
  open,
  target,
  onClose,
  onConfirm,
}: ProductVariantSelectionModalProps) {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const detailQuery = useCatalogProductDetailQuery(
    branchId,
    target?.id ?? null,
    target?.kind,
    open,
  );
  const detail = detailQuery.data;

  const [selected, setSelected] = useState<Record<string, VariantSelectState>>(
    {},
  );
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  // Toggle "trừ tồn" — render đúng UI, chưa nối logic (xem plan §4 quyết định 4).
  const [deductStock, setDeductStock] = useState(false);

  // Khởi tạo lựa chọn khi mở dialog / khi chi tiết về: 1 biến thể → tick sẵn.
  useEffect(() => {
    if (!open || !detail) return;
    const init: Record<string, VariantSelectState> = {};
    const single = detail.variants.length === 1;
    for (const v of detail.variants) {
      init[v.itemId] = { checked: single, qty: 1 };
    }
    setSelected(init);
    setFilters({});
    setDeductStock(false);
  }, [open, detail]);

  const visibleVariants = useMemo(() => {
    if (!detail) return [];
    const dims = Object.entries(filters).filter(([, set]) => set.size > 0);
    if (dims.length === 0) return detail.variants;
    return detail.variants.filter((v) =>
      dims.every(([dim, set]) =>
        v.attributes.some((a) => a.name === dim && set.has(a.value)),
      ),
    );
  }, [detail, filters]);

  const selectedList = useMemo<VariantSelection[]>(() => {
    if (!detail) return [];
    return detail.variants
      .filter((v) => selected[v.itemId]?.checked && selected[v.itemId]!.qty >= 1)
      .map((v) => ({ variant: v, qty: selected[v.itemId]!.qty }));
  }, [detail, selected]);

  const toggleRow = (itemId: string, checked: boolean) =>
    setSelected((s) => ({
      ...s,
      [itemId]: { checked, qty: s[itemId]?.qty ?? 1 },
    }));

  const toggleAll = (checked: boolean) =>
    setSelected((s) => {
      const next = { ...s };
      for (const v of visibleVariants) {
        next[v.itemId] = { checked, qty: next[v.itemId]?.qty ?? 1 };
      }
      return next;
    });

  const changeQty = (itemId: string, raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    setSelected((s) => ({ ...s, [itemId]: { checked: true, qty: n } }));
  };

  const toggleFilter = (dimension: string, value: string | null) =>
    setFilters((f) => {
      const next = { ...f };
      if (value === null) {
        delete next[dimension];
        return next;
      }
      const set = new Set(next[dimension] ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size === 0) delete next[dimension];
      else next[dimension] = set;
      return next;
    });

  const title = detail?.name ?? target?.title ?? "Chọn biến thể";

  return (
    <PosDialog open={open} onClose={onClose} width={1000}>
      <PosDialog.Header title={title} />
      <PosDialog.Body className="space-y-6">
        <ProductHeaderInfo
          name={title}
          description={detail?.description ?? null}
        />

        {detailQuery.isLoading ? (
          <p className="py-8 text-center text-[13px] text-gray-500">Đang tải…</p>
        ) : detailQuery.error ? (
          <p className="py-8 text-center text-[13px] text-[#EF4444]">
            Không tải được chi tiết sản phẩm: {detailQuery.error.message}
          </p>
        ) : !detail || detail.variants.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-gray-500">
            Sản phẩm chưa có biến thể.
          </p>
        ) : (
          <>
            <VariantFilterChips
              attributes={detail.attributes}
              variants={detail.variants}
              filters={filters}
              onToggle={toggleFilter}
            />
            <div className="overflow-x-auto">
              <VariantTable
                variants={visibleVariants}
                selected={selected}
                onToggleRow={toggleRow}
                onToggleAll={toggleAll}
                onQtyChange={changeQty}
              />
            </div>
          </>
        )}
      </PosDialog.Body>

      <footer className="flex h-16 items-center justify-between gap-4 border-t border-gray-200 bg-white px-6">
        <div className="flex items-center gap-3 text-[13px] text-[#1F2937]">
          <PosToggle
            checked={deductStock}
            onChange={setDeductStock}
            ariaLabel={FOOTER_LABEL}
          />
          <span>{FOOTER_LABEL}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={selectedList.length === 0}
            onClick={() => onConfirm(selectedList)}
            className={confirmBtn}
          >
            Đồng ý
          </button>
          <button type="button" onClick={onClose} className={closeBtn}>
            Đóng
          </button>
        </div>
      </footer>
    </PosDialog>
  );
}
