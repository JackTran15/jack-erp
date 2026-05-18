import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import {
  isInDateRange,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { EMPTY_RETURN_INVOICE_FILTERS } from "@erp/pos/constants/return-goods.constant";
import { getMockReturnInvoices } from "@erp/pos/lib/page-libs/return-goods/mockData";
import { buildInvoiceReturnCartLines } from "@erp/pos/lib/page-libs/return-goods/toCheckoutCartLines";
import {
  clampReturnQty,
  sumSelectedReturnTotal,
} from "@erp/pos/lib/page-libs/return-goods/returnGoodsMath";
import type {
  ReturnInvoiceFilters,
  ReturnInvoiceRow,
  ReturnableItem,
} from "@erp/pos/lib/page-libs/return-goods/return-goods.types";

interface UseReturnGoodsResult {
  /** Date-range pill at top-left of the page. */
  dateRange: PosDateRangeFilterOption;
  setDateRange: (next: PosDateRangeFilterOption) => void;
  /** Per-column filter inputs in the table header strip. */
  filters: ReturnInvoiceFilters;
  setFilter: (key: keyof ReturnInvoiceFilters, value: string) => void;
  /** Mock-source invoice rows after applying filters and date range. */
  rows: ReadonlyArray<ReturnInvoiceRow>;
  /** Items-dialog state for the currently active invoice. */
  dialog: {
    open: boolean;
    invoice: ReturnInvoiceRow | null;
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
 * Backed by mock data; swap `getMockReturnInvoices` for a TanStack Query hook
 * once the backend exists.
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

  const allRows = useMemo(() => getMockReturnInvoices(), []);

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

  const openInvoice = useCallback<UseReturnGoodsResult["openInvoice"]>(
    (row) => {
      setActiveInvoice(row);
      setSelectedIds(new Set());
      const initialQty: Record<string, number> = {};
      for (const item of row.items) initialQty[item.id] = 0;
      setQtyById(initialQty);
      setDialogOpen(true);
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const toggleItem = useCallback<UseReturnGoodsResult["toggleItem"]>((id) => {
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
      const item = activeInvoice?.items.find((i) => i.id === id);
      if (!item) return prev;
      return { ...prev, [id]: clampReturnQty(1, item.allowedQty) };
    });
  }, [activeInvoice]);

  const toggleAllItems = useCallback<UseReturnGoodsResult["toggleAllItems"]>(
    (next) => {
      if (!activeInvoice) return;
      if (next) {
        setSelectedIds(new Set(activeInvoice.items.map((i) => i.id)));
        setQtyById((prev) => {
          const updated = { ...prev };
          for (const item of activeInvoice.items) {
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
    [activeInvoice],
  );

  const setReturnQty = useCallback<UseReturnGoodsResult["setReturnQty"]>(
    (id, value) => {
      setQtyById((prev) => ({ ...prev, [id]: value }));
    },
    [],
  );

  const confirmReturn = useCallback(() => {
    if (!activeInvoice) return;
    const lines = buildInvoiceReturnCartLines(
      activeInvoice,
      selectedIds,
      qtyById,
    );
    if (lines.length === 0) {
      setDialogOpen(false);
      return;
    }
    enterInvoiceReturnWithLines(lines);
    setDialogOpen(false);
    navigate("/");
  }, [activeInvoice, selectedIds, qtyById, enterInvoiceReturnWithLines, navigate]);

  const items: ReadonlyArray<ReturnableItem> = activeInvoice?.items ?? [];
  const selectedTotal = sumSelectedReturnTotal(items, qtyById, selectedIds);

  return {
    dateRange,
    setDateRange,
    filters,
    setFilter,
    rows,
    dialog: {
      open: dialogOpen,
      invoice: activeInvoice,
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
