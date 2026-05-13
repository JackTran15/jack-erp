import { CustomerStatsPanel } from "./CustomerStatsPanel";
import { MembershipCard } from "./MembershipCard";
import type { CustomerDetailData } from "./types";

export interface OverviewTabProps {
  data: CustomerDetailData;
  onChangeCard?: () => void;
  onRefreshPoints?: () => void;
}

/**
 * "Tổng quan" tab — 2-column layout: membership card (left, 460px) + stats
 * panel (right, flex-1). Spec 3.2 / 4.4 / 4.6.
 */
export function OverviewTab({
  data,
  onChangeCard,
  onRefreshPoints,
}: OverviewTabProps) {
  return (
    <div className="grid grid-cols-[460px_1fr] gap-5">
      <MembershipCard
        name={data.identity.name}
        membership={data.membership}
        onChangeCard={onChangeCard}
        onRefreshPoints={onRefreshPoints}
      />
      <CustomerStatsPanel stats={data.stats} />
    </div>
  );
}
