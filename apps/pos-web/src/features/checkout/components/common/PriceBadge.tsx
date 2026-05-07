import { formatVnd } from "@erp/ui";

export interface PriceBadgeProps {
  amount: number;
}

/**
 * Brand-green pill displaying a VND amount. Used on product cards and
 * anywhere a "price tag" visual is needed.
 */
export function PriceBadge({ amount }: PriceBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full bg-green-500 px-2 py-[2px] text-[11px] font-semibold leading-none text-white">
      {formatVnd(amount)}
    </span>
  );
}
