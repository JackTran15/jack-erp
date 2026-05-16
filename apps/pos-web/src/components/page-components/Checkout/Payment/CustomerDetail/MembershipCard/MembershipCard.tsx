import { RefreshIcon, ShoppingBagIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CustomerDetailData } from "@erp/pos/lib/checkout/customerDetail.types";

export interface MembershipCardProps {
  data: CustomerDetailData;
  onRefreshPoints?: () => void;
  onChangeCard?: () => void;
}

/**
 * Teal gradient card displayed in the "Tổng quan" tab (spec 4.4 / 4.5).
 * Renders avatar circle, customer name, "Đổi thẻ" outline button, and three
 * info rows (mã thẻ, điểm tích lũy, sử dụng điểm).
 */
export function MembershipCard({
  data,
  onRefreshPoints,
  onChangeCard,
}: MembershipCardProps) {
  const { name } = data;
  const cardCode = data.cardCode ?? "—";
  const points = data.loyaltyPoints ?? 0;
  const used = data.pointsUsed ?? 0;
  const cap = data.pointsCap ?? Math.max(used, points, 100);
  const fillPercent = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;

  return (
    <div
      className="relative flex h-[280px] w-full flex-col gap-3 overflow-hidden rounded-xl px-6 py-5 text-white shadow-[0_4px_16px_rgba(0,150,136,0.25)]"
      style={{
        background:
          "linear-gradient(135deg, #26A69A 0%, #00897B 50%, #004D40 100%)",
      }}
    >
      {/* Decorative arc — bottom-right. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-white/[0.08]"
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
            <ShoppingBagIcon size={22} className="text-white/80" />
          </span>
          <div className="text-[16px] font-bold leading-tight">{name}</div>
        </div>
        <button
          type="button"
          onClick={onChangeCard}
          className="inline-flex h-8 items-center justify-center rounded-md border border-white/60 bg-white/15 px-4 text-[13px] font-medium text-white transition-colors hover:bg-white/25"
        >
          Đổi thẻ
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px]">
        <span className="text-white/75">Mã thẻ thành viên</span>
        <span className="font-semibold text-white">{cardCode}</span>
      </div>

      <div className="flex items-center justify-between text-[13px]">
        <span className="text-white/75">Điểm tích lũy</span>
        <span className="inline-flex items-center gap-1 font-medium text-white">
          {points}
          <button
            type="button"
            onClick={onRefreshPoints}
            aria-label="Làm mới điểm tích lũy"
            className="text-white/70 transition-colors hover:text-white"
          >
            <RefreshIcon size={14} />
          </button>
        </span>
      </div>

      <div className="space-y-1.5 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-white/75">Sử dụng điểm</span>
          <span className="font-medium text-white">{used}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
