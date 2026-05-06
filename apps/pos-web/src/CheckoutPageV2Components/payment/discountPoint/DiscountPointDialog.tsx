import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogTitle, cn, formatVnd } from "@erp/ui";
import { LayersIcon, SearchIcon } from "../../icons/Icon";
import type { DiscountPointData, MemberCardData } from "./types";

export interface DiscountPointDialogProps {
  open: boolean;
  onClose: () => void;

  /** Member card / stats data shown in the left panel. */
  data?: DiscountPointData;

  /**
   * Voucher search input — internal by default. Provide both
   * `searchValue` + `onSearchChange` to lift state (e.g. to debounce).
   */
  searchValue?: string;
  onSearchChange?: (next: string) => void;

  /** Fired when the user submits the search (Enter or "Tìm kiếm"). */
  onSearchVoucher?: (code: string) => void;

  /** "Đổi thẻ" pill — opens a card-change flow. Omit to disable visually. */
  onChangeCard?: () => void;

  /** Controlled "Sử dụng điểm" input — host owns the value. */
  pointsUsed?: number;
  onChangePointsUsed?: (next: number) => void;
}

/**
 * "Mã ưu đãi và điểm" dialog opened from the PromoMenu's "Mã ưu đãi" entry.
 * Two-column layout: membership card panel (left) + voucher search panel
 * (right) with an empty-state illustration. Self-contained — every
 * collaboration point (data, search, points input, dismiss) is a prop so
 * the host can swap in real wiring later.
 */
export function DiscountPointDialog({
  open,
  onClose,
  data,
  searchValue,
  onSearchChange,
  onSearchVoucher,
  onChangeCard,
  pointsUsed,
  onChangePointsUsed,
}: DiscountPointDialogProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalPoints, setInternalPoints] = useState<number>(0);

  // Reset transient inputs each time the dialog (re-)opens — avoids stale
  // values bleeding into the next session.
  useEffect(() => {
    if (open) {
      setInternalSearch("");
      setInternalPoints(data?.member?.pointsUsed ?? 0);
    }
  }, [open, data?.member?.pointsUsed]);

  const search = searchValue ?? internalSearch;
  const setSearch = (next: string) => {
    if (onSearchChange) onSearchChange(next);
    else setInternalSearch(next);
  };

  const points = pointsUsed ?? internalPoints;
  const setPoints = (next: number) => {
    if (onChangePointsUsed) onChangePointsUsed(next);
    else setInternalPoints(next);
  };

  const handleSubmitSearch = (e: FormEvent) => {
    e.preventDefault();
    const code = search.trim();
    if (!code) return;
    onSearchVoucher?.(code);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-[95vw] max-w-[1120px] flex-col gap-0 overflow-hidden p-0",
          "rounded-lg bg-[#F1F3F5] shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
        )}
      >
        {/* 4.2 Header — title + close (rendered by DialogContent). */}
        <header className="flex h-14 items-center border-b border-[#E5E7EB] px-6">
          <DialogTitle className="text-[18px] font-semibold leading-tight text-[#1F2937]">
            Mã ưu đãi và điểm
          </DialogTitle>
        </header>

        {/* Body: 2 columns */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
          <MembershipPanel
            member={data?.member}
            onChangeCard={onChangeCard}
            pointsUsed={points}
            onChangePointsUsed={setPoints}
          />
          <VoucherSearchPanel
            value={search}
            onChange={setSearch}
            onSubmit={handleSubmitSearch}
          />
        </div>

        {/* 4.14 Footer */}
        <footer className="flex h-16 items-center justify-end border-t border-[#E5E7EB] bg-[#F1F3F5] px-6">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border border-[#E5E7EB] bg-white px-5 text-[14px] font-medium text-[#1F2937]",
              "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors",
              "hover:border-[#D1D5DB] hover:bg-[#F9FAFB] active:bg-[#F3F4F6]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC]/50 focus-visible:ring-offset-2",
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
// Left panel — membership card + stats + use-points
// ---------------------------------------------------------------------------

interface MembershipPanelProps {
  member?: MemberCardData;
  onChangeCard?: () => void;
  pointsUsed: number;
  onChangePointsUsed: (next: number) => void;
}

function MembershipPanel({
  member,
  onChangeCard,
  pointsUsed,
  onChangePointsUsed,
}: MembershipPanelProps) {
  const totalSpent = member?.totalSpent ?? 0;
  const loyaltyPoints = member?.loyaltyPoints ?? 0;
  const pointsRate = member?.pointsRate ?? 1;
  const moneyFromPoints = pointsUsed * pointsRate;

  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-lg border border-[#E5E7EB] bg-white p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      )}
    >
      <MemberCardTeal member={member} onChangeCard={onChangeCard} />

      {/* 4.6 StatsRow */}
      <div className="flex items-start justify-between">
        <StatBlock
          label="Tổng chi tiêu"
          value={formatVnd(totalSpent)}
          tone="success"
        />
        <StatBlock
          label="Điểm tích lũy"
          value={formatVnd(loyaltyPoints)}
          tone="warning"
          align="right"
        />
      </div>

      {/* 4.7 UsePointsRow — underline numeric input */}
      <UsePointsRow
        value={pointsUsed}
        onChange={onChangePointsUsed}
        moneyFromPoints={moneyFromPoints}
      />
    </section>
  );
}

interface MemberCardTealProps {
  member?: MemberCardData;
  onChangeCard?: () => void;
}

function MemberCardTeal({ member, onChangeCard }: MemberCardTealProps) {
  const name = member?.name?.trim() || "Khách";
  const cardNumber = member?.cardNumber || "—";

  return (
    <div
      className={cn(
        "relative flex h-[200px] flex-col justify-between overflow-hidden rounded-xl p-5 text-white",
        "shadow-[0_8px_24px_rgba(14,107,92,0.15)]",
      )}
      style={{
        background: "linear-gradient(135deg, #1FA98C 0%, #0E6B5C 100%)",
      }}
    >
      {/* Decorative bubbles — top-right */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full bg-white/[0.08]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 top-10 h-36 w-36 rounded-full bg-white/[0.06]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-6 -top-4 h-20 w-20 rounded-full bg-white/[0.05]"
      />

      {/* Top row: avatar + name (left) | "Đổi thẻ" pill (right) */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
            <LayersIcon size={18} className="text-[#0E6B5C]" />
          </span>
          <span className="text-[16px] font-semibold leading-tight">
            {name}
          </span>
        </div>
        <button
          type="button"
          onClick={onChangeCard}
          disabled={!onChangeCard}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-full bg-[#4FCFAA] px-4 text-[13px] font-medium text-white",
            "transition-[filter,transform] hover:brightness-110 active:brightness-95",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Đổi thẻ
        </button>
      </div>

      {/* Bottom row: label (left) | card number (right) */}
      <div className="relative flex items-end justify-between gap-3">
        <span className="text-[13px] text-white/80">Mã thẻ thành viên</span>
        <span className="text-[16px] font-bold tracking-[0.02em] tabular-nums text-white">
          {cardNumber}
        </span>
      </div>
    </div>
  );
}

interface StatBlockProps {
  label: string;
  value: string;
  tone: "success" | "warning";
  align?: "left" | "right";
}

function StatBlock({ label, value, tone, align = "left" }: StatBlockProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "right" ? "items-end text-right" : "items-start text-left",
      )}
    >
      <span className="text-[13px] text-[#6B7280]">{label}</span>
      <span
        className={cn(
          "text-[22px] font-medium leading-none",
          tone === "success" ? "text-[#2EAA3D]" : "text-[#F59E0B]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface UsePointsRowProps {
  value: number;
  onChange: (next: number) => void;
  moneyFromPoints: number;
}

function UsePointsRow({ value, onChange, moneyFromPoints }: UsePointsRowProps) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#E5E7EB] pb-2">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="discount-point-use-input"
          className="text-[13px] font-normal text-[#1F2937]"
        >
          Sử dụng điểm
        </label>
        <input
          id="discount-point-use-input"
          type="text"
          inputMode="numeric"
          value={value === 0 ? "0" : String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            onChange(digits === "" ? 0 : Number(digits));
          }}
          className={cn(
            "w-24 bg-transparent text-right text-[14px] text-[#1F2937]",
            "focus:outline-none",
          )}
        />
      </div>
      <p className="text-[12px] italic text-[#9CA3AF]">
        {`${formatVnd(value)} điểm = ${formatVnd(moneyFromPoints)}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel — voucher search + empty state
// ---------------------------------------------------------------------------

interface VoucherSearchPanelProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (e: FormEvent) => void;
}

function VoucherSearchPanel({
  value,
  onChange,
  onSubmit,
}: VoucherSearchPanelProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-6 rounded-lg border border-[#E5E7EB] bg-white p-6",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      )}
    >
      {/* 4.9 SearchBar — input + submit, gap 8px */}
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
          >
            <SearchIcon size={16} strokeWidth={2} />
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Nhập mã ưu đãi"
            aria-label="Nhập mã ưu đãi"
            className={cn(
              "h-11 w-full rounded-lg border border-[#D1D5DB] bg-white pl-10 pr-4 text-[14px] text-[#1F2937]",
              "placeholder:italic placeholder:text-[#9CA3AF]",
              "transition-colors hover:border-[#9CA3AF]",
              "focus:border-[#4F46E5] focus:outline-none focus:ring-[3px] focus:ring-[#4F46E5]/15",
            )}
          />
        </div>
        <button
          type="submit"
          disabled={!value.trim()}
          className={cn(
            "inline-flex h-11 items-center justify-center rounded-lg bg-[#4F46E5] px-5 text-[14px] font-medium text-white",
            "shadow-[0_2px_4px_rgba(79,70,229,0.2)] transition-colors",
            "hover:bg-[#4338CA] active:bg-[#3730A3]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Tìm kiếm
        </button>
      </form>

      {/* 4.12 Empty state */}
      <VoucherEmptyState />

      {/* 4.13 Decorative progress line */}
      <div
        aria-hidden="true"
        className="mt-auto h-1 w-full rounded-full bg-[#E5E7EB]"
      />
    </section>
  );
}

function VoucherEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <VoucherIllustration />
      <div className="flex flex-col gap-1">
        <p className="text-[14px] italic text-[#6B7280]">Nhập mã ưu đãi</p>
        <p className="text-[14px] italic text-[#6B7280]">
          Sau đó nhập Enter để tìm kiếm
        </p>
      </div>
    </div>
  );
}

/** Inline SVG illustration — magnifying glass + voucher tickets + clouds. */
function VoucherIllustration() {
  return (
    <svg
      viewBox="0 0 200 140"
      width="160"
      height="112"
      role="img"
      aria-label="Tìm kiếm mã ưu đãi"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Clouds (back) */}
      <g
        stroke="#D1D5DB"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M16 116c4-6 12-7 17-3 1-7 11-9 16-3 4-3 12-1 13 5" />
        <path d="M134 122c3-5 10-6 14-2 1-5 9-7 13-2 3-2 9-1 10 4" />
      </g>

      {/* Voucher tickets */}
      <g>
        <rect
          x="22"
          y="22"
          width="48"
          height="28"
          rx="6"
          transform="rotate(-12 22 22)"
          fill="#FB7185"
          opacity="0.85"
        />
        <line
          x1="32"
          y1="36"
          x2="58"
          y2="30"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          transform="rotate(-12 22 22)"
        />
        <rect
          x="138"
          y="34"
          width="44"
          height="26"
          rx="6"
          transform="rotate(8 138 34)"
          fill="#F97316"
          opacity="0.85"
        />
        <line
          x1="146"
          y1="48"
          x2="170"
          y2="44"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          transform="rotate(8 138 34)"
        />
      </g>

      {/* Magnifying glass */}
      <g
        stroke="#6366F1"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#EEF2FF"
      >
        <circle cx="100" cy="74" r="28" />
        <line
          x1="120"
          y1="94"
          x2="138"
          y2="112"
          stroke="#6366F1"
          strokeWidth="5"
          fill="none"
        />
      </g>
      {/* Highlight on the glass */}
      <path
        d="M86 64c4-6 12-10 20-10"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
