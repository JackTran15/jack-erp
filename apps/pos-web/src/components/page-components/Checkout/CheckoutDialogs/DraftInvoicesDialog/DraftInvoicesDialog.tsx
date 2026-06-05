import { useCallback, useEffect, useMemo, useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  dateRangeToISO,
  type PosDateRangeFilterOption,
} from "@erp/pos/lib/common/dateRangeFilter";
import { useControllableState } from "@erp/pos/hooks/common/use-controllable-state";
import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { useDraftInvoicesQuery } from "@erp/pos/hooks/react-query/use-query-invoice";
import { mapInvoiceRowToDraftInvoice } from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import type { SearchDraftInvoicesBody } from "@erp/pos/dtos/invoice.dto";
import type { DraftInvoice } from "@erp/pos/interfaces/checkout.interface";
import { FilterBar } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/FilterBar/FilterBar";
import { InvoiceDetailPanel } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/InvoiceDetailPanel/InvoiceDetailPanel";
import { InvoiceListPanel } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DraftInvoicesDialog/InvoiceListPanel/InvoiceListPanel";

const DRAFT_INVOICES_PAGE_SIZE = 100;

export interface DraftInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * POS session id cố định của terminal dùng để filter draft trên BE. Truyền
   * `posSessionId` từ `usePosCheckoutSessionStore` (ổn định, không đổi theo tab).
   */
  sessionId: string;
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
 * Self-fetching qua `GET /invoices/drafts?session_id=...` — chỉ fetch khi `open`.
 */
export function DraftInvoicesDialog({
  open,
  onClose,
  sessionId,
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

  // Free-text + date range đẩy xuống server (debounce text để khỏi gọi mỗi ký tự).
  const debouncedSearch = useDebounce(searchState.value);
  const searchBody = useMemo<SearchDraftInvoicesBody>(() => {
    const range = dateRangeToISO(filterState.value);
    const hasDate = Boolean(range.from ?? range.to);
    return {
      page: 1,
      limit: DRAFT_INVOICES_PAGE_SIZE,
      search: debouncedSearch.trim() || undefined,
      ...(hasDate ? { createdAt: range } : {}),
    };
  }, [debouncedSearch, filterState.value]);

  const draftsQuery = useDraftInvoicesQuery({
    body: searchBody,
    sessionId,
    enabled: open,
  });

  // API drafts trả kèm object `customer` nhúng (name/phone) → map thẳng. Việc lọc
  // đã chuyển về server, không filter client nữa.
  const drafts = useMemo<DraftInvoice[]>(
    () =>
      (draftsQuery.data ?? []).map((row) =>
        mapInvoiceRowToDraftInvoice(row, row.customer ?? null),
      ),
    [draftsQuery.data],
  );

  const handleOpenReset = useCallback(() => {
    setSelectedId(initialSelectedId ?? drafts[0]?.id ?? null);
    searchState.reset("");
    filterState.reset("ALL");
  }, [drafts, filterState, initialSelectedId, searchState]);
  useDialogReset(open, handleOpenReset);

  // Keep `selectedId` valid when the (server-filtered) list changes.
  useEffect(() => {
    if (!open) return;
    if (drafts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !drafts.some((d) => d.id === selectedId)) {
      setSelectedId(drafts[0]!.id);
    }
  }, [drafts, open, selectedId]);

  const selectedDraft = useMemo(
    () => drafts.find((d) => d.id === selectedId) ?? null,
    [drafts, selectedId],
  );

  const handleConfirm = () => {
    if (!selectedDraft) return;
    onConfirm?.(selectedDraft);
    onClose();
  };

  const isLoading = draftsQuery.isLoading && drafts.length === 0;
  const isError = draftsQuery.isError;

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={1280}
      contentClassName="h-full bg-[#F1F2F5]"
    >
      <PosDialog.Header title="Hóa đơn chưa thanh toán" />
      <PosDialog.Body className="flex flex-col gap-4">
        <FilterBar
          search={searchState.value}
          onSearchChange={searchState.setValue}
          filter={filterState.value}
          onFilterChange={filterState.setValue}
        />

        {isLoading ? (
          <p className="flex-1 px-4 py-12 text-center text-[14px] italic text-[#9CA0AB]">
            Đang tải hóa đơn lưu tạm…
          </p>
        ) : isError ? (
          <p className="flex-1 px-4 py-12 text-center text-[14px] italic text-red-600">
            Không tải được danh sách hóa đơn lưu tạm.
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[38fr_62fr]">
            <InvoiceListPanel
              drafts={drafts}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={onDelete}
            />
            <InvoiceDetailPanel draft={selectedDraft} />
          </div>
        )}
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleConfirm}
        onCancel={onClose}
        saveDisabled={!selectedDraft}
      />
    </PosDialog>
  );
}
