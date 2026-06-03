import { cn, formatVnd } from "@erp/ui";
import { LOYALTY_TEXT } from "@erp/pos/constants/checkout-messages.constant";
import type { MemberCardData } from "@erp/pos/interfaces/discount-point.interface";
import { MemberCardTeal } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DiscountPointDialog/MembershipPanel/MemberCardTeal/MemberCardTeal";
import { StatBlock } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DiscountPointDialog/MembershipPanel/StatBlock/StatBlock";
import { UsePointsRow } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DiscountPointDialog/MembershipPanel/UsePointsRow/UsePointsRow";

interface MembershipPanelProps {
  member?: MemberCardData;
  onChangeCard?: () => void;
  pointsUsed: number;
  onChangePointsUsed: (next: number) => void;
}

const formatPoints = new Intl.NumberFormat("vi-VN");

export function MembershipPanel({
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
      <div className="flex items-start justify-between">
        <StatBlock
          label="Tổng chi tiêu"
          value={formatVnd(totalSpent)}
          tone="success"
        />
        <StatBlock
          label={LOYALTY_TEXT.LOYALTY_POINTS_LABEL}
          value={`${formatPoints.format(loyaltyPoints)} ${LOYALTY_TEXT.POINTS_SUFFIX}`}
          tone="warning"
          align="right"
        />
      </div>
      <UsePointsRow
        value={pointsUsed}
        onChange={onChangePointsUsed}
        moneyFromPoints={moneyFromPoints}
      />
    </section>
  );
}
