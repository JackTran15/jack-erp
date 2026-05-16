import { cn, formatVnd } from "@erp/ui";
import type { MemberCardData } from "@erp/pos/lib/checkout/discountPoint.types";
import { MemberCardTeal } from "@erp/pos/components/page-components/Checkout/Payment/DiscountPoint/MemberCardTeal/MemberCardTeal";
import { StatBlock } from "@erp/pos/components/page-components/Checkout/Payment/DiscountPoint/StatBlock/StatBlock";
import { UsePointsRow } from "@erp/pos/components/page-components/Checkout/Payment/DiscountPoint/UsePointsRow/UsePointsRow";

interface MembershipPanelProps {
  member?: MemberCardData;
  onChangeCard?: () => void;
  pointsUsed: number;
  onChangePointsUsed: (next: number) => void;
}

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
          label="Điểm tích lũy"
          value={formatVnd(loyaltyPoints)}
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
