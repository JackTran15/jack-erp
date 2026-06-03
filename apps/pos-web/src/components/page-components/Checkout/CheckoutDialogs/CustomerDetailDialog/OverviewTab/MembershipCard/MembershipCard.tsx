import { RefreshIcon, ShoppingBagIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { LOYALTY_TEXT } from "@erp/pos/constants/checkout-messages.constant";
import type { CustomerDetailData } from "@erp/pos/interfaces/customer-detail.interface";

interface TierStyle { bg: string; shadow: string }

const TIER_STYLE: Record<string, TierStyle> = {
  // Không hạng — xám than trung tính
  none: {
    bg: "linear-gradient(135deg, #6B7280 0%, #4B5563 55%, #1F2937 100%)",
    shadow: "rgba(75,85,99,0.4)",
  },
  // Bạc — xanh thép lạnh, ánh kim loại
  silver: {
    bg: "linear-gradient(135deg, #93C5FD 0%, #3B82F6 40%, #1D4ED8 100%)",
    shadow: "rgba(59,130,246,0.35)",
  },
  // Vàng — hổ phách ấm, sang trọng
  gold: {
    bg: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 45%, #92400E 100%)",
    shadow: "rgba(245,158,11,0.4)",
  },
  // Kim cương — tím amethyst cao cấp
  diamond: {
    bg: "linear-gradient(135deg, #C084FC 0%, #7C3AED 45%, #3B0764 100%)",
    shadow: "rgba(124,58,237,0.4)",
  },
};

// Chưa cấp thẻ — giữ teal gốc, gợi mời đăng ký
const NO_CARD_STYLE: TierStyle = {
  bg: "linear-gradient(135deg, #2DD4BF 0%, #0D9488 50%, #115E59 100%)",
  shadow: "rgba(13,148,136,0.3)",
};

export interface MembershipCardProps {
  data: CustomerDetailData;
  onRefreshPoints?: () => void;
  onChangeCard?: () => void;
  onIssueCard?: () => void;
}

/**
 * Teal gradient card displayed in the "Tổng quan" tab (spec 4.4 / 4.5).
 * Renders avatar circle, customer name, "Đổi thẻ" outline button, and three
 * info rows (mã thẻ, điểm tích lũy, sử dụng điểm). Khi khách chưa có thẻ
 * (cardCode == null) → hiển thị nhãn empty state "Khách chưa có thẻ thành viên"
 * thay cho mã thẻ; điểm/used vẫn render = 0 (không ẩn — giữ layout ổn định).
 */
export function MembershipCard({
  data,
  onRefreshPoints,
  onChangeCard,
  onIssueCard,
}: MembershipCardProps) {
  const { name } = data;
  const hasCard = Boolean(data.cardCode);
  const cardCode = data.cardCode ?? LOYALTY_TEXT.NO_CARD;
  const points = data.loyaltyPoints ?? 0;
  const used = data.pointsUsed ?? 0;
  const cap = data.pointsCap ?? Math.max(used, points, 100);
  const fillPercent = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;

  const style = hasCard
    ? (TIER_STYLE[data.tier ?? ""] ?? TIER_STYLE["none"]!)
    : NO_CARD_STYLE;

  return (
    <div
      className="relative flex h-[280px] w-full flex-col gap-3 overflow-hidden rounded-xl px-6 py-5 text-white"
      style={{
        background: style.bg,
        boxShadow: `0 4px 16px ${style.shadow}`,
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
        {hasCard ? (
          <button
            type="button"
            onClick={onChangeCard}
            className="inline-flex h-8 items-center justify-center rounded-md border border-white/60 bg-white/15 px-4 text-[13px] font-medium text-white transition-colors hover:bg-white/25"
          >
            Đổi thẻ
          </button>
        ) : (
          <button
            type="button"
            onClick={onIssueCard}
            className="inline-flex h-8 items-center justify-center rounded-md border border-white/80 bg-white/25 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/35"
          >
            Cấp thẻ
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px]">
        <span className="text-white/75">Mã thẻ thành viên</span>
        <span
          className={
            hasCard
              ? "font-semibold text-white"
              : "text-[12px] italic text-white/80"
          }
        >
          {cardCode}
        </span>
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
