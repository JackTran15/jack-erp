import { CashFlowOverTimeWidget } from "./CashFlowOverTimeWidget/CashFlowOverTimeWidget";
import { RevenueCostProfitWidget } from "./RevenueCostProfitWidget/RevenueCostProfitWidget";

/** Row 2 — hai widget chart tài chính đặt cạnh nhau. */
export function OverviewRow2() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
      <RevenueCostProfitWidget />
      <CashFlowOverTimeWidget />
    </div>
  );
}
