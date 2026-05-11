import { cn } from "@erp/ui";
import { LayersIcon } from "@erp/pos/components/icons/Icon";
import type { MemberCardData } from "./types";

interface MemberCardTealProps {
  member?: MemberCardData;
  onChangeCard?: () => void;
}

export function MemberCardTeal({ member, onChangeCard }: MemberCardTealProps) {
  const name = member?.name?.trim() || "Khách";
  const cardNumber = member?.cardNumber || "—";

  return (
    <div
      className={cn(
        "relative flex h-[200px] flex-col justify-between overflow-hidden rounded-xl p-5 text-white",
        "shadow-[0_8px_24px_rgba(14,107,92,0.15)]",
      )}
      style={{ background: "linear-gradient(135deg, #1FA98C 0%, #0E6B5C 100%)" }}
    >
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
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
            <LayersIcon size={18} className="text-[#0E6B5C]" />
          </span>
          <span className="text-[16px] font-semibold leading-tight">{name}</span>
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
      <div className="relative flex items-end justify-between gap-3">
        <span className="text-[13px] text-white/80">Mã thẻ thành viên</span>
        <span className="text-[16px] font-bold tracking-[0.02em] tabular-nums text-white">
          {cardNumber}
        </span>
      </div>
    </div>
  );
}
