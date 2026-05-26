import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import {
  isInDateRange,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { EMPTY_RETURN_INVOICE_FILTERS } from "@erp/pos/constants/return-goods.constant";
import {
  useEligibleReturnsQuery,
  useReturnableInvoicesQuery,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import { mapEligibleLineToReturnableItem } from "@erp/pos/lib/page-libs/return-goods/returnInvoiceMapper";
import { buildInvoiceReturnCartLines } from "@erp/pos/lib/page-libs/return-goods/toCheckoutCartLines";
import {
  clampReturnQty,
  sumSelectedReturnTotal,
} from "@erp/pos/lib/page-libs/return-goods/returnGoodsMath";
import type { ReturnInvoiceFilters } from "@erp/pos/dtos/return-goods.dto";
import type {
  ReturnInvoiceRow,
  ReturnableItem,
} from "@erp/pos/interfaces/return-goods.interface";

interface UseReturnGoodsResult {
  /** Date-range pill at top-left of the page. */
  dateRange: PosDateRangeFilterOption;
  setDateRange: (next: PosDateRangeFilterOption) => void;
  /** Per-column filter inputs in the table header strip. */
  filters: ReturnInvoiceFilters;
  setFilter: (key: keyof ReturnInvoiceFilters, value: string) => void;
  /** Paid invoice rows (from `GET /invoices`) after applying filters + date range. */
  rows: ReadonlyArray<ReturnInvoiceRow>;
  /** Loading state for the invoice listing. */
  isLoading: boolean;
  /** Items-dialog state for the currently active invoice. */
  dialog: {
    open: boolean;
    invoice: ReturnInvoiceRow | null;
    /** Returnable lines from `GET /invoices/:id/eligible-returns`. */
    items: ReadonlyArray<ReturnableItem>;
    /** True while eligible-returns is loading. */
    loading: boolean;
    selectedIds: ReadonlySet<string>;
    qtyById: Readonly<Record<string, number>>;
    /** Sum of (unitPrice × qty) across the chosen lines. */
    selectedTotal: number;
  };
  openInvoice: (row: ReturnInvoiceRow) => void;
  closeDialog: () => void;
  toggleItem: (id: string) => void;
  toggleAllItems: (next: boolean) => void;
  setReturnQty: (id: string, value: number) => void;
  confirmReturn: () => void;
}

function matchesText(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function matchesNumberInput(value: number, raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const target = Number.parseFloat(trimmed.replace(/[.,\s]/g, ""));
  if (!Number.isFinite(target)) return true;
  return value <= target;
}

/**
 * State machine for the `/return-goods` page. Owns the date-range pill, the
 * per-column filter strip, the items dialog, and per-line return quantities.
 * Listing comes from `GET /invoices` (status=paid); the returnable lines for a
 * chosen invoice are fetched lazily via `GET /invoices/:id/eligible-returns`.
 * Confirm pushes the selection into a new INVOICE_RETURN checkout tab carrying
 * the original invoice id (→ `POST /invoices/returns` mode=regular at checkout).
 */
export function useReturnGoods(): UseReturnGoodsResult {
  const navigate = useNavigate();
  const enterInvoiceReturnWithLines = usePosCheckoutSessionStore(
    (s) => s.enterInvoiceReturnWithLines,
  );

  const [dateRange, setDateRange] = useState<PosDateRangeFilterOption>("TODAY");
  const [filters, setFilters] = useState<ReturnInvoiceFilters>(
    () => ({ ...EMPTY_RETURN_INVOICE_FILTERS }),
  );

  const invoicesQuery = useReturnableInvoicesQuery();
  const allRows = useMemo(
    () => invoicesQuery.data ?? [],
    [invoicesQuery.data],
  );

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (!isInDateRange(row.createdAt, dateRange)) return false;
      if (!matchesText(row.invoiceNumber, filters.invoiceNumber)) return false;
      if (!matchesText(row.customerName, filters.customerName)) return false;
      if (!matchesText(row.customerPhone, filters.customerPhone)) return false;
      if (!matchesText(row.branchName, filters.branchName)) return false;
      if (!matchesNumberInput(row.totalAmount, filters.totalAmount)) {
        return false;
      }
      return true;
    });
  }, [allRows, dateRange, filters]);

  const setFilter = useCallback<UseReturnGoodsResult["setFilter"]>(
    (key, value) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<ReturnInvoiceRow | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [qtyById, setQtyById] = useState<Record<string, number>>({});

  const eligibleQuery = useEligibleReturnsQuery(activeInvoice?.id);
  const items = useMemo<ReturnableItem[]>(
    () => (eligibleQuery.data ?? []).map(mapEligibleLineToReturnableItem),
    [eligibleQuery.data],
  );

  // Khi danh sách hàng được phép trả nạp xong (mở hóa đơn mới) → khởi tạo qty=0.
  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const item of items) initial[item.id] = 0;
    setQtyById(initial);
    setSelectedIds(new Set());
  }, [items]);

  const openInvoice = useCallback<UseReturnGoodsResult["openInvoice"]>((row) => {
    setActiveInvoice(row);
    setSelectedIds(new Set());
    setQtyById({});
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const toggleItem = useCallback<UseReturnGoodsResult["toggleItem"]>(
    (id) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      // Default to qty=1 when first selected (operator can adjust).
      setQtyById((prev) => {
        if (prev[id] && prev[id] > 0) return prev;
        const item = items.find((i) => i.id === id);
        if (!item) return prev;
        return { ...prev, [id]: clampReturnQty(1, item.allowedQty) };
      });
    },
    [items],
  );

  const toggleAllItems = useCallback<UseReturnGoodsResult["toggleAllItems"]>(
    (next) => {
      if (next) {
        setSelectedIds(new Set(items.map((i) => i.id)));
        setQtyById((prev) => {
          const updated = { ...prev };
          for (const item of items) {
            if (!updated[item.id] || updated[item.id] === 0) {
              updated[item.id] = clampReturnQty(1, item.allowedQty);
            }
          }
          return updated;
        });
      } else {
        setSelectedIds(new Set());
      }
    },
    [items],
  );

  const setReturnQty = useCallback<UseReturnGoodsResult["setReturnQty"]>(
    (id, value) => {
      setQtyById((prev) => ({ ...prev, [id]: value }));
    },
    [],
  );

  const confirmReturn = useCallback(() => {
    if (!activeInvoice) return;
    const lines = buildInvoiceReturnCartLines(items, selectedIds, qtyById);
    if (lines.length === 0) {
      setDialogOpen(false);
      return;
    }
    // Mang khách của hóa đơn gốc sang tab trả hàng (tự điền + khóa ở checkout).
    const customer = activeInvoice.customerId
      ? {
          id: activeInvoice.customerId,
          name: activeInvoice.customerName,
          phone: activeInvoice.customerPhone || null,
        }
      : null;
    enterInvoiceReturnWithLines(lines, activeInvoice.id, customer);
    setDialogOpen(false);
    navigate("/");
  }, [activeInvoice, items, selectedIds, qtyById, enterInvoiceReturnWithLines, navigate]);

  const selectedTotal = sumSelectedReturnTotal(items, qtyById, selectedIds);

  return {
    dateRange,
    setDateRange,
    filters,
    setFilter,
    rows,
    isLoading: invoicesQuery.isLoading,
    dialog: {
      open: dialogOpen,
      invoice: activeInvoice,
      items,
      loading: eligibleQuery.isLoading && Boolean(activeInvoice),
      selectedIds,
      qtyById,
      selectedTotal,
    },
    openInvoice,
    closeDialog,
    toggleItem,
    toggleAllItems,
    setReturnQty,
    confirmReturn,
  };
}
