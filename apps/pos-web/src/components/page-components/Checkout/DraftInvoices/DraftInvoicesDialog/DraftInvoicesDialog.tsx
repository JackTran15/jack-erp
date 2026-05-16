import { useCallback, useEffect, useMemo, useState } from "react";
import type { DraftInvoice } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  isInDateRange,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { useControllableState } from "@erp/pos/hooks/common/use-controllable-state";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { FilterBar } from "@erp/pos/components/page-components/Checkout/DraftInvoices/FilterBar/FilterBar";
import { InvoiceDetailPanel } from "@erp/pos/components/page-components/Checkout/DraftInvoices/InvoiceDetailPanel/InvoiceDetailPanel";
import { InvoiceListPanel } from "@erp/pos/components/page-components/Checkout/DraftInvoices/InvoiceListPanel/InvoiceListPanel";

export interface DraftInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
  drafts: DraftInvoice[];
  /** Pre-selected draft id when the modal mounts. */
  initialSelectedId?: string | null;

  /** Confirm (e.g. "Đồng ý"): opens the draft on a new invoice tab without overwriting the current tab. */
  onConfirm?: (draft: DraftInvoice) => void;
  /** Inline `×` per row. */
  onDelete?: (id: string) => void;

  /**
   * Search input is uncontrolled by default. Provide both `searchValue` +
   * `onSearchChange` to lift state (e.g. server-side filtering).
   */
  searchValue?: string;
  onSearchChange?: (next: string) => void;

  /**
   * Date filter is uncontrolled by default — the dialog manages its own
   * popover + selection and filters in-memory by `createdAt`. Lift via
   * `dateFilter` + `onDateFilterChange` when needed.
   */
  dateFilter?: PosDateRangeFilterOption;
  onDateFilterChange?: (next: PosDateRangeFilterOption) => void;
}

/**
 * "Hóa đơn chưa thanh toán" picker. Two-pane modal:
 *   • Left  — master list of saved drafts with inline delete.
 *   • Right — receipt-style detail panel with line items + total + zigzag edge.
 *
 * Self-contained — selection / search / date filter live inside; collaboration
 * points (`onConfirm`, `onDelete`, optional controlled props) keep the dialog
 * reusable from any host that holds the draft store.
 */
export function DraftInvoicesDialog({
  open,
  onClose,
  drafts,
  initialSelectedId = null,
  onConfirm,
  onDelete,
  searchValue,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
}: DraftInvoicesDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const searchState = useControllableState<string>({
    value: searchValue,
    defaultValue: "",
    onChange: onSearchChange,
  });
  const filterState = useControllableState<PosDateRangeFilterOption>({
    value: dateFilter,
    defaultValue: "ALL",
    onChange: onDateFilterChange,
  });

  const handleOpenReset = useCallback(() => {
    setSelectedId(initialSelectedId ?? drafts[0]?.id ?? null);
    searchState.reset("");
    filterState.reset("ALL");
  }, [drafts, filterState, initialSelectedId, searchState]);
  useDialogReset(open, handleOpenReset);

  const filteredDrafts = useMemo(() => {
    const q = searchState.value.trim().toLowerCase();
    return drafts.filter((d) => {
      if (!isInDateRange(d.createdAt, filterState.value)) return false;
      if (!q) return true;
      const haystacks = [
        d.invoiceNumber,
        d.customerName ?? "",
        d.customerPhone ?? "",
      ];
      return haystacks.some((s) => s.toLowerCase().includes(q));
    });
  }, [drafts, searchState.value, filterState.value]);

  // Keep `selectedId` valid when the filtered list changes.
  useEffect(() => {
    if (!open) return;
    if (filteredDrafts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredDrafts.some((d) => d.id === selectedId)) {
      setSelectedId(filteredDrafts[0]!.id);
    }
  }, [filteredDrafts, open, selectedId]);

  const selectedDraft = useMemo(
    () => filteredDrafts.find((d) => d.id === selectedId) ?? null,
    [filteredDrafts, selectedId],
  );

  const handleConfirm = () => {
    if (!selectedDraft) return;
    onConfirm?.(selectedDraft);
    onClose();
  };

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={1280}
      contentClassName="h-full bg-[#F1F2F5]"
    >
      <PosDialog.Header title="Hóa đơn chưa thanh toán" />
      <PosDialog.Body className="flex flex-col gap-4">
        {/* 4.3 Filter bar */}
        <FilterBar
          search={searchState.value}
          onSearchChange={searchState.setValue}
          filter={filterState.value}
          onFilterChange={filterState.setValue}
        />

        {/* 4.5+ Two-pane body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[38fr_62fr]">
          <InvoiceListPanel
            drafts={filteredDrafts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={onDelete}
          />
          <InvoiceDetailPanel draft={selectedDraft} />
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleConfirm}
        onCancel={onClose}
        saveDisabled={!selectedDraft}
      />
    </PosDialog>
  );
}
