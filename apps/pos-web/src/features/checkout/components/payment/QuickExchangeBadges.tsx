export interface QuickExchangeBadgesProps {
  /** Total qty in the return cart. */
  returnQuantity: number;
  /** Total qty in the purchase cart. */
  purchaseQuantity: number;
}

/**
 * Read-only summary: đổi trả / mua thêm labels + qty badges (wraps naturally, no full-width stretch).
 */
export function QuickExchangeBadges({
  returnQuantity,
  purchaseQuantity,
}: QuickExchangeBadgesProps) {
  return (
    <div
      role="region"
      aria-label="Đổi trả / Mua thêm"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 bg-white px-3 py-3 text-[14px] font-medium"
    >
      <span className="inline-flex items-center gap-1.5 text-orange-900">
        đổi trả
        <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
          {returnQuantity}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-emerald-800">
        mua thêm
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
          {purchaseQuantity}
        </span>
      </span>
    </div>
  );
}
