import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, cn } from "@erp/ui";
import { PlusCircleIcon, SearchIcon } from "../../icons/Icon";
import type {
  PromotionItem,
  PromotionKind,
  PromotionStatusInfo,
  PromotionStatusTone,
} from "./types";

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

const KIND_LABELS: Record<PromotionKind, string> = {
  AMOUNT_OFF: "Giảm tiền",
  PERCENT_OFF: "Giảm %",
  GIFT: "Tặng quà",
  VOUCHER: "Voucher",
  LOYALTY: "Tích / dùng điểm",
  CUSTOM: "Khác",
};

const STATUS_TONE_DEFAULT: Record<PromotionStatusInfo["value"], PromotionStatusTone> = {
  ACTIVE: "success",
  SCHEDULED: "info",
  PAUSED: "warning",
  EXPIRED: "muted",
};

const STATUS_LABEL_DEFAULT: Record<PromotionStatusInfo["value"], string> = {
  ACTIVE: "Đang áp dụng",
  SCHEDULED: "Sắp diễn ra",
  PAUSED: "Tạm dừng",
  EXPIRED: "Đã kết thúc",
};

const TONE_CLASS: Record<PromotionStatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  muted: "bg-gray-100 text-gray-600",
  info: "bg-indigo-50 text-indigo-700",
};

function kindLabel(item: PromotionItem): string {
  return item.kindLabel ?? KIND_LABELS[item.kind] ?? "—";
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
  const [internalSearch, setInternalSearch] = useState("");

  // Reset selection + search every time the dialog opens — avoids stale picks
  // bleeding into the next session (the spec implies a fresh selection flow).
  useEffect(() => {
    if (open) {
      setSelectedId(initialSelectedId ?? null);
      setInternalSearch("");
    }
  }, [open, initialSelectedId]);

  const search = searchValue ?? internalSearch;
  const setSearch = (next: string) => {
    if (onSearchChange) onSearchChange(next);
    else setInternalSearch(next);
  };

  const rows = useMemo(() => {
    const list = promotions ?? [];
    if (onSearchChange) return list; // controlled — host already filtered
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [promotions, search, onSearchChange]);

  const confirmDisabled = requireSelection && !selectedId;

  const handleConfirm = () => {
    const picked = rows.find((p) => p.id === selectedId) ?? null;
    onConfirm?.(picked);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-[95vw] max-w-[1072px] flex-col gap-0 overflow-hidden p-0",
          "rounded-lg shadow-[0_20px_48px_rgba(15,23,42,0.12)]",
        )}
      >
        {/* 4.2 Header — title + built-in close (rendered by DialogContent). */}
        <header className="px-6 pb-2 pt-6">
          <DialogTitle className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#0F172A]">
            Chương trình khuyến mãi
          </DialogTitle>
        </header>

        {/* 4.5 Search input */}
        <div className="px-6 pt-4">
          <div className="relative w-full max-w-[400px]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]"
            >
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
        <div className="px-6 pt-4">
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

        {/* 4.11 Footer — primary on the left, "Đóng" on the right (per spec). */}
        <footer className="mt-auto flex items-center justify-end gap-3 px-6 pb-5 pt-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg px-6 text-[14px] font-semibold text-white",
              "bg-[#6366F1] transition-colors hover:bg-[#4F46E5] active:bg-[#4338CA]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:bg-[#C7D2FE]",
            )}
          >
            Đồng ý
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-6 text-[14px] font-semibold text-[#0F172A]",
              "transition-colors hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
            )}
          >
            Đóng
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

interface PromotionTableProps {
  rows: PromotionItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function PromotionTable({ rows, selectedId, onSelect }: PromotionTableProps) {
  return (
    <div role="grid" aria-label="Danh sách chương trình khuyến mãi">
      {/* Header row — gray bg, rounded top corners. */}
      <div
        role="row"
        className={cn(
          "grid items-center rounded-t-[4px] bg-[#F5F6F8] px-4 py-3",
          "grid-cols-[30%_15%_30%_25%] text-[14px] font-semibold text-[#0F172A]",
        )}
      >
        <div role="columnheader">Tên chương trình</div>
        <div role="columnheader">Hình thức</div>
        <div role="columnheader">Mô tả</div>
        <div role="columnheader">Trạng thái</div>
      </div>

      {/* Body — fixed height (~280px) so the layout stays stable when empty. */}
      <div
        className={cn(
          "min-h-[280px] divide-y divide-[#EEF0F3] bg-white",
          rows.length === 0 ? "flex items-center justify-center" : "",
        )}
      >
        {rows.length === 0 ? (
          <p className="py-12 text-[14px] text-[#94A3B8]">
            Chưa có chương trình khuyến mãi nào để áp dụng
          </p>
        ) : (
          rows.map((p) => (
            <PromotionRow
              key={p.id}
              promotion={p}
              selected={p.id === selectedId}
              onSelect={() => !p.disabled && onSelect(p.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface PromotionRowProps {
  promotion: PromotionItem;
  selected: boolean;
  onSelect: () => void;
}

function PromotionRow({ promotion, selected, onSelect }: PromotionRowProps) {
  const status = promotion.status;
  const tone = status?.tone ?? (status ? STATUS_TONE_DEFAULT[status.value] : "muted");
  const label = status?.label ?? (status ? STATUS_LABEL_DEFAULT[status.value] : "—");

  return (
    <button
      type="button"
      role="row"
      aria-selected={selected}
      disabled={promotion.disabled}
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[30%_15%_30%_25%] items-center px-4 py-3 text-left text-[14px] transition-colors",
        "hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-inset",
        selected ? "bg-[#EEF2FF]" : "",
        promotion.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <div role="gridcell" className="truncate font-medium text-[#0F172A]">
        {promotion.name}
      </div>
      <div role="gridcell" className="truncate text-[#475569]">
        {kindLabel(promotion)}
      </div>
      <div role="gridcell" className="truncate text-[#475569]">
        {promotion.description ?? "—"}
      </div>
      <div role="gridcell">
        {status ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium",
              TONE_CLASS[tone],
            )}
          >
            {label}
          </span>
        ) : (
          <span className="text-[#94A3B8]">—</span>
        )}
      </div>
    </button>
  );
}
