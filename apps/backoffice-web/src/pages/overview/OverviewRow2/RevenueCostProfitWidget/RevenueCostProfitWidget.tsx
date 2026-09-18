import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOverviewStore } from "../../../../store/page-stores/overview/overview.store";
import { CHART_COLOR } from "../../_lib/echarts/baseOption";
import { REVENUE_WIDGET_PERIODS } from "../../_lib/period";
import { useOverviewScope } from "../../_lib/useOverviewScope";
import { fetchRevenueCostProfit } from "../../_mock/revenueCostProfit.mock";
import { ChartWidgetPanel } from "../../ChartWidgetPanel/ChartWidgetPanel";
import { HeaderPeriodSelect } from "../../ChartWidgetPanel/WidgetHeader/HeaderPeriodSelect/HeaderPeriodSelect";
import { SummaryStatChipGroup } from "../../SummaryStatChipGroup/SummaryStatChipGroup";
import { RevenueCostProfitChart } from "./RevenueCostProfitChart/RevenueCostProfitChart";
import { RevenueCostProfitOptionsModal } from "./RevenueCostProfitOptionsModal/RevenueCostProfitOptionsModal";

/** Row 2 trái — "Doanh thu, chi phí, lợi nhuận" theo cửa hàng. */
export function RevenueCostProfitWidget() {
  const scope = useOverviewScope();
  const { period } = useOverviewStore((s) => s.row2Revenue);
  const setRow2Revenue = useOverviewStore((s) => s.actions.setRow2Revenue);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["overview", "revenue-cost-profit", scope.key, period],
    queryFn: () =>
      fetchRevenueCostProfit({
        scopeKey: scope.key,
        scopeLabel: scope.label,
        period,
      }),
  });

  const toggleSeries = (key: string) =>
    setHiddenKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );

  return (
    <ChartWidgetPanel
      title="Doanh thu, chi phí, lợi nhuận"
      periodSelect={
        <HeaderPeriodSelect
          value={period}
          periods={REVENUE_WIDGET_PERIODS}
          onChange={(next) => setRow2Revenue({ period: next })}
        />
      }
      onOpenOptions={() => setOptionsOpen(true)}
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      updatedAt={data ? new Date(data.updatedAt) : undefined}
      modal={
        <RevenueCostProfitOptionsModal
          open={optionsOpen}
          period={period}
          onClose={() => setOptionsOpen(false)}
          onConfirm={(next) => {
            setRow2Revenue({ period: next });
            setOptionsOpen(false);
          }}
        />
      }
    >
      <SummaryStatChipGroup
        items={[
          {
            key: "revenue",
            label: "Doanh thu",
            color: CHART_COLOR.blue,
            value: data?.totals.revenue ?? 0,
          },
          {
            key: "cost",
            label: "Chi phí",
            color: CHART_COLOR.orange,
            value: data?.totals.cost ?? 0,
          },
          {
            key: "profit",
            label: "Lợi nhuận",
            color: CHART_COLOR.green,
            value: data?.totals.profit ?? 0,
          },
        ]}
        hiddenKeys={hiddenKeys}
        onToggle={toggleSeries}
      />
      <div className="mt-6">
        <RevenueCostProfitChart
          points={data?.byStore ?? []}
          hiddenKeys={hiddenKeys}
          loading={isFetching}
        />
      </div>
    </ChartWidgetPanel>
  );
}
