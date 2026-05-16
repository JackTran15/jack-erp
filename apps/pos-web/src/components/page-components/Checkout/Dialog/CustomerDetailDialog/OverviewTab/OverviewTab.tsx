import { CustomerStatsPanel } from "@erp/pos/components/page-components/Checkout/Dialog/CustomerDetailDialog/OverviewTab/CustomerStatsPanel/CustomerStatsPanel";
import { MembershipCard } from "@erp/pos/components/page-components/Checkout/Dialog/CustomerDetailDialog/OverviewTab/MembershipCard/MembershipCard";
import type { CustomerDetailData } from "@erp/pos/lib/page-libs/checkout/customerDetail.types";

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
        data={data}
        onChangeCard={onChangeCard}
        onRefreshPoints={onRefreshPoints}
      />
      <CustomerStatsPanel stats={data.stats} />
    </div>
  );
}
