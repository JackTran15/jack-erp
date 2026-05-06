import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, cn, formatVnd } from "@erp/ui";
import { ChevronDownIcon, CloseIcon, SearchIcon } from "../icons/Icon";
import type { DraftInvoice } from "../types";
import {
  buildZigzagClipPath,
  DATE_RANGE_CHOICES,
  isInDateRange,
  type DateRangeOption,
} from "./types";

export interface DraftInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
  drafts: DraftInvoice[];
  /** Pre-selected draft id when the modal mounts. */
  initialSelectedId?: string | null;

  /** "Đồng ý" — restore the picked draft into the active cart. */
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
  dateFilter?: DateRangeOption;
  onDateFilterChange?: (next: DateRangeOption) => void;
}

const ZIGZAG_CLIP_PATH = buildZigzagClipPath(40, 6);

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatCreatedAt(d: Date): string {
  return dateFormatter.format(d).replace(",", "");
}

function lineDescription(line: { code: string; name: string }): string {
  // Spec: line 1 = SKU/code, line 2 = full name. Avoid duplicating SKU when
  // name already contains the code.
  const includesCode = line.code && line.name.includes(line.code);
  return includesCode ? line.name : `${line.name} ${line.code}`.trim();
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
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [internalSearch, setInternalSearch] = useState("");
  const [internalFilter, setInternalFilter] = useState<DateRangeOption>("ALL");

  // Reset selection + transient inputs each time the dialog (re-)opens.
  useEffect(() => {
    if (!open) return;
    setSelectedId(initialSelectedId ?? drafts[0]?.id ?? null);
    setInternalSearch("");
    setInternalFilter("ALL");
  }, [open, initialSelectedId, drafts]);

  const search = searchValue ?? internalSearch;
  const setSearch = (next: string) => {
    if (onSearchChange) onSearchChange(next);
    else setInternalSearch(next);
  };

  const filter = dateFilter ?? internalFilter;
  const setFilter = (next: DateRangeOption) => {
    if (onDateFilterChange) onDateFilterChange(next);
    else setInternalFilter(next);
  };

  const filteredDrafts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drafts.filter((d) => {
      if (!isInDateRange(d.createdAt, filter)) return false;
      if (!q) return true;
      const haystacks = [
        d.invoiceNumber,
        d.customerName ?? "",
        d.customerPhone ?? "",
      ];
      return haystacks.some((s) => s.toLowerCase().includes(q));
    });
  }, [drafts, search, filter]);

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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "flex h-full max-h-[90vh] w-[95vw] max-w-[1280px] flex-col gap-4 overflow-hidden p-6",
          "rounded-xl bg-[#F1F2F5] shadow-[0_24px_64px_rgba(15,20,36,0.18),0_8px_16px_rgba(15,20,36,0.08)]",
        )}
      >
        {/* 4.2 Header */}
        <header className="flex items-center justify-between gap-4">
          <DialogTitle className="text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-[#1F2233]">
            Hóa đơn chưa thanh toán
          </DialogTitle>
          {/* DialogContent renders its own × close — no extra trigger needed. */}
        </header>

        {/* 4.3 Filter bar */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
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

        {/* 4.16 Footer */}
        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedDraft}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg bg-[#6366F1] px-6 text-[14px] font-semibold text-white transition-colors",
              "hover:bg-[#5457E0] active:bg-[#4347C9]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:bg-[#C7CAEC]",
            )}
          >
            Đồng ý
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg border border-[#E1E3EA] bg-white px-6 text-[14px] font-medium text-[#1F2233] transition-colors",
              "hover:bg-[#F7F8FA] hover:border-[#C7CAD3] active:bg-[#EEEFF2]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1]/40 focus-visible:ring-offset-2",
            )}
          >
            Đóng
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// FilterBar: search + date range select
// ---------------------------------------------------------------------------

interface FilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  filter: DateRangeOption;
  onFilterChange: (next: DateRangeOption) => void;
}

function FilterBar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative w-full max-w-[400px]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA0AB]"
        >
          <SearchIcon size={16} />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Nhập tên, số điện thoại khách hàng, số hóa đơn"
          aria-label="Tìm kiếm hóa đơn"
          className={cn(
            "h-10 w-full rounded-lg border border-[#E1E3EA] bg-[#F4F5F7] pl-10 pr-4 text-[14px] text-[#1F2233]",
            "placeholder:italic placeholder:text-[#9CA0AB]",
            "focus:border-[#6366F1] focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]/15",
          )}
        />
      </div>

      <DateRangeSelect value={filter} onChange={onFilterChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateRangeSelect: trigger + popover (radio list + footer actions)
// ---------------------------------------------------------------------------

interface DateRangeSelectProps {
  value: DateRangeOption;
  onChange: (next: DateRangeOption) => void;
}

function DateRangeSelect({ value, onChange }: DateRangeSelectProps) {
  const [open, setOpen] = useState(false);
  // Draft selection inside the popover — only commits to `value` on "Áp dụng".
  const [pending, setPending] = useState<DateRangeOption>(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setPending(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel =
    DATE_RANGE_CHOICES.find((c) => c.value === value)?.label ?? "Toàn bộ";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Lọc theo khoảng thời gian"
        className={cn(
          "flex h-10 w-[280px] items-center justify-between rounded-lg border border-[#E1E3EA] bg-white px-4 text-[14px] font-medium text-[#1F2233] transition-colors",
          "hover:border-[#C7CAD3] hover:bg-[#FAFAFB]",
          "focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]/15",
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDownIcon
          size={16}
          strokeWidth={2}
          className={cn(
            "text-[#6366F1] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Khoảng thời gian"
          className={cn(
            "absolute left-0 z-[1100] mt-1 w-[280px] rounded-lg border border-[#E6E8EE] bg-white",
            "shadow-[0_8px_24px_rgba(15,20,36,0.12),0_2px_4px_rgba(15,20,36,0.06)]",
          )}
        >
          <div className="py-2">
            {DATE_RANGE_CHOICES.map((choice) => {
              const selected = choice.value === pending;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => setPending(choice.value)}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-3 text-left text-[14px] transition-colors",
                    selected
                      ? "bg-[#EEEEFB] font-medium text-[#6366F1]"
                      : "text-[#1F2233] hover:bg-[#F4F5F7]",
                  )}
                >
                  <RadioCircle selected={selected} />
                  {choice.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-6 border-t border-[#E6E8EE] px-5 py-3.5">
            <button
              type="button"
              onClick={() => {
                onChange(pending);
                setOpen(false);
              }}
              className="text-[14px] font-semibold text-[#6366F1] transition-colors hover:text-[#5457E0]"
            >
              Áp dụng
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[14px] font-medium text-[#4B5163] transition-colors hover:text-[#1F2233]"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RadioCircle({ selected }: { selected: boolean }) {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <span
        className={cn(
          "h-4 w-4 rounded-full border transition-colors",
          selected ? "border-2 border-[#6366F1]" : "border-[#C7CAD3]",
        )}
      />
      {selected ? (
        <span
          aria-hidden="true"
          className="absolute h-1.5 w-1.5 rounded-full bg-[#6366F1]"
        />
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Left panel: invoice list
// ---------------------------------------------------------------------------

interface InvoiceListPanelProps {
  drafts: DraftInvoice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

function InvoiceListPanel({
  drafts,
  selectedId,
  onSelect,
  onDelete,
}: InvoiceListPanelProps) {
  return (
    <div
      role="region"
      aria-label="Danh sách hóa đơn"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#E6E8EE] bg-white",
        "shadow-[0_1px_2px_rgba(15,20,36,0.04)]",
      )}
    >
      <div
        className={cn(
          "grid items-center bg-[#F7F8FA] px-4 py-3 text-[14px] font-semibold text-[#4B5163]",
          "grid-cols-[1.2fr_1fr_1fr_1.3fr_24px] gap-4",
        )}
        role="row"
      >
        <div role="columnheader">Số hóa đơn</div>
        <div role="columnheader">Tên khách hàng</div>
        <div role="columnheader">Số điện thoại</div>
        <div role="columnheader">Thời gian tạo</div>
        <span aria-hidden="true" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <p className="px-4 py-12 text-center text-[14px] italic text-[#9CA0AB]">
            Chưa có hóa đơn lưu tạm
          </p>
        ) : (
          drafts.map((d) => (
            <DraftRow
              key={d.id}
              draft={d}
              selected={d.id === selectedId}
              onSelect={() => onSelect(d.id)}
              onDelete={
                onDelete
                  ? (e) => {
                      e.stopPropagation();
                      onDelete(d.id);
                    }
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

interface DraftRowProps {
  draft: DraftInvoice;
  selected: boolean;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function DraftRow({ draft, selected, onSelect, onDelete }: DraftRowProps) {
  return (
    <button
      type="button"
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full items-center gap-4 px-4 py-3.5 text-left text-[14px] text-[#1F2233] transition-colors",
        "grid-cols-[1.2fr_1fr_1fr_1.3fr_24px]",
        "border-b border-[#F0F1F5] last:border-b-0",
        selected ? "bg-[#EEEEFB]" : "hover:bg-[#F7F8FA]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] focus-visible:ring-inset",
      )}
    >
      <span role="gridcell" className="tabular-nums">
        {draft.invoiceNumber}
      </span>
      <span role="gridcell" className="truncate">
        {draft.customerName ?? ""}
      </span>
      <span role="gridcell" className="truncate">
        {draft.customerPhone ?? ""}
      </span>
      <span role="gridcell" className="tabular-nums text-[#4B5163]">
        {formatCreatedAt(draft.createdAt)}
      </span>
      <span role="gridcell" className="flex items-center justify-center">
        {onDelete ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Xóa hóa đơn ${draft.invoiceNumber}`}
            onClick={onDelete}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onDelete(e as unknown as React.MouseEvent);
              }
            }}
            className={cn(
              "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[#E74C5E] transition-colors",
              "hover:bg-[rgba(231,76,94,0.1)]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E74C5E]",
            )}
          >
            <CloseIcon size={16} strokeWidth={2} />
          </span>
        ) : null}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Right panel: invoice detail with zigzag bottom edge
// ---------------------------------------------------------------------------

interface InvoiceDetailPanelProps {
  draft: DraftInvoice | null;
}

function InvoiceDetailPanel({ draft }: InvoiceDetailPanelProps) {
  return (
    <div
      role="region"
      aria-label="Chi tiết hóa đơn"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border border-[#E6E8EE] bg-white",
        "rounded-t-lg",
        "shadow-[0_1px_2px_rgba(15,20,36,0.04)]",
      )}
      style={{ clipPath: ZIGZAG_CLIP_PATH, paddingBottom: 6 }}
    >
      <div
        className={cn(
          "grid bg-[#F7F8FA] px-6 py-3 text-[14px] font-semibold text-[#4B5163]",
          "grid-cols-[1fr_80px_100px_100px] gap-4",
        )}
        role="row"
      >
        <div role="columnheader">Tên hàng hóa</div>
        <div role="columnheader" className="text-right">Số lượng</div>
        <div role="columnheader" className="text-right">Đơn giá</div>
        <div role="columnheader" className="text-right">Thành tiền</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!draft || draft.lines.length === 0 ? (
          <p className="px-6 py-12 text-center text-[14px] italic text-[#9CA0AB]">
            Chọn một hóa đơn để xem chi tiết
          </p>
        ) : (
          draft.lines.map((line, idx) => (
            <div
              key={line.lineId}
              role="row"
              className={cn(
                "grid gap-4 px-6 py-3.5 text-[14px] text-[#1F2233]",
                "grid-cols-[1fr_80px_100px_100px]",
                idx % 2 === 1 ? "bg-[#F7F7FA]" : "bg-white",
              )}
            >
              <div role="gridcell" className="flex flex-col gap-0.5">
                <span className="font-semibold text-[#1F2233]">
                  {line.code || line.name}
                </span>
                <span className="text-[13px] text-[#4B5163]">
                  {lineDescription(line)}
                </span>
              </div>
              <div role="gridcell" className="text-right tabular-nums">
                {line.qty}
              </div>
              <div role="gridcell" className="text-right tabular-nums">
                {formatVnd(line.unitPrice)}
              </div>
              <div role="gridcell" className="text-right tabular-nums">
                {formatVnd(line.unitPrice * line.qty)}
              </div>
            </div>
          ))
        )}
      </div>

      {draft ? (
        <div className="flex items-center justify-between border-t border-[#E6E8EE] px-6 py-4">
          <span className="text-[14px] font-medium text-[#4B5163]">Tổng tiền</span>
          <span className="text-[20px] font-bold leading-[1.2] tracking-[-0.01em] text-[#0F1424] tabular-nums">
            {formatVnd(draft.total)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
