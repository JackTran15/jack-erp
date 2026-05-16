import { useCallback, useMemo, useState } from "react";
import { cn } from "@erp/ui";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useControllableState } from "@erp/pos/hooks/common/use-controllable-state";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { PlusCircleIcon, SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PromotionTable } from "@erp/pos/components/page-components/Checkout/Payment/Promotion/PromotionTable/PromotionTable";
import type {
  PromotionItem,
} from "@erp/pos/lib/page-libs/checkout/promotion.types";

export interface PromotionSelectionModalProps {
  open: boolean;
  onClose: () => void;

  /**
   * Available promotions. When omitted or empty the table renders an empty
   * state (no illustration, just blank space — matches the spec).
   */
  promotions?: PromotionItem[];

  /**
   * Pre-selected promotion id when the modal mounts — drives the highlighted
   * row + enables the "Đồng ý" CTA. Caller may keep it controlled.
   */
  initialSelectedId?: string | null;

  /**
   * Search input is internal by default. Provide `searchValue` +
   * `onSearchChange` to lift it (e.g. for server-side filtering with
   * debounce). When uncontrolled, the modal does in-memory case-insensitive
   * filtering on `name` + `description`.
   */
  searchValue?: string;
  onSearchChange?: (next: string) => void;

  /** "Đồng ý" — confirm. Receives the chosen promotion (or null if none). */
  onConfirm?: (promotion: PromotionItem | null) => void;

  /** "Thêm khuyến mại" — opens a secondary creation flow. Omit to hide. */
  onAddPromotion?: () => void;

  /**
   * Disable confirm when nothing is selected (default true). Set false to let
   * users confirm with no selection (e.g. clearing the applied promotion).
   */
  requireSelection?: boolean;
}


/**
 * Promotion selection dialog opened from "Voucher / Quà tặng" in the payment
 * panel. Renders a fixed-height table (empty-state friendly) plus a
 * "Khuyến mại khác" section with an outline CTA, and footer actions.
 *
 * Modular by design: state for selection + search lives inside, but every
 * collaboration point (search, confirm, add, dismiss) is a prop so the host
 * can swap in real data + handlers.
 */
export function PromotionSelectionModal({
  open,
  onClose,
  promotions,
  initialSelectedId = null,
  searchValue,
  onSearchChange,
  onConfirm,
  onAddPromotion,
  requireSelection = true,
}: PromotionSelectionModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const searchState = useControllableState<string>({
    value: searchValue,
    defaultValue: "",
    onChange: onSearchChange,
  });
  const handleOpenReset = useCallback(() => {
    setSelectedId(initialSelectedId ?? null);
    searchState.reset("");
  }, [initialSelectedId, searchState]);
  useDialogReset(open, handleOpenReset);

  const rows = useMemo(() => {
    const list = promotions ?? [];
    if (onSearchChange) return list; // controlled — host already filtered
    const q = searchState.value.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [promotions, searchState.value, onSearchChange]);

  const confirmDisabled = requireSelection && !selectedId;

  const handleConfirm = () => {
    const picked = rows.find((p) => p.id === selectedId) ?? null;
    onConfirm?.(picked);
    onClose();
  };

  return (
    <PosDialog open={open} onClose={onClose} width={1072}>
      <PosDialog.Header title="Chương trình khuyến mãi" />
      <PosDialog.Body>
        {/* 4.5 Search input */}
        <div className="w-full">
          <div className="relative w-full max-w-[400px]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]"
            >
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              value={searchState.value}
              onChange={(e) => searchState.setValue(e.target.value)}
              placeholder="Tìm kiếm tên chương trình khuyến mãi"
              aria-label="Tìm kiếm chương trình khuyến mãi"
              className={cn(
                "h-9 w-full rounded-md border border-[#E2E8F0] bg-white pl-9 pr-3 text-[14px] text-[#0F172A]",
                "placeholder:italic placeholder:text-[#94A3B8]",
                "transition-colors hover:border-[#CBD5E1]",
                "focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/15",
              )}
            />
          </div>
        </div>

        {/* 4.6 Table */}
        <div className="w-full pt-4">
          <PromotionTable
            rows={rows}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
          />
        </div>

        {/* 4.9 / 4.10 "Khuyến mại khác" — outline CTA */}
        {onAddPromotion ? (
          <div className="px-6 pt-8">
            <p className="text-[14px] font-semibold text-[#0F172A]">
              Khuyến mại khác
            </p>
            <button
              type="button"
              onClick={onAddPromotion}
              className={cn(
                "mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#6366F1] bg-white px-4 text-[14px] font-medium text-[#6366F1]",
                "transition-colors hover:bg-[#EEF2FF] active:bg-[#E0E7FF]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
              )}
            >
              <PlusCircleIcon size={18} />
              Thêm khuyến mại
            </button>
          </div>
        ) : null}
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleConfirm}
        onCancel={onClose}
        saveDisabled={confirmDisabled}
      />
    </PosDialog>
  );
}
