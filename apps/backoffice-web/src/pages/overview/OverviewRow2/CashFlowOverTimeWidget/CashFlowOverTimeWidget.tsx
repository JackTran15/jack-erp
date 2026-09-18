import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOverviewStore } from "../../../../store/page-stores/overview/overview.store";
import { CHART_COLOR } from "../../_lib/echarts/baseOption";
import { CASH_FLOW_PERIODS } from "../../_lib/granularity";
import type { TimeBucketGranularity } from "../../_lib/timeBuckets";
import { useOverviewScope } from "../../_lib/useOverviewScope";
import { fetchCashFlow } from "../../_mock/cashFlow.mock";
import { ChartWidgetPanel } from "../../ChartWidgetPanel/ChartWidgetPanel";
import { HeaderPeriodSelect } from "../../ChartWidgetPanel/WidgetHeader/HeaderPeriodSelect/HeaderPeriodSelect";
import { SummaryStatChipGroup } from "../../SummaryStatChipGroup/SummaryStatChipGroup";
import { CashFlowOptionsModal } from "./CashFlowOptionsModal/CashFlowOptionsModal";
import { CashFlowOverTimeChart } from "./CashFlowOverTimeChart/CashFlowOverTimeChart";

/** Row 2 phải — "Tình hình thu chi tiền theo thời gian". */
export function CashFlowOverTimeWidget() {
  const scope = useOverviewScope();
  const { granularity, period } = useOverviewStore((s) => s.row2CashFlow);
  const setRow2CashFlow = useOverviewStore((s) => s.actions.setRow2CashFlow);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  // Row 2 chỉ dùng hai granularity theo thời gian nên thu hẹp kiểu ngay tại đây.
  const bucketGranularity = granularity as TimeBucketGranularity;

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["overview", "cash-flow", scope.key, granularity, period],
    queryFn: () =>
      fetchCashFlow({
        scopeKey: scope.key,
        period,
        granularity: bucketGranularity,
      }),
  });

  const toggleSeries = (key: string) =>
    setHiddenKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );

  return (
    <ChartWidgetPanel
      title="Tình hình thu chi tiền theo thời gian"
      periodSelect={
        <HeaderPeriodSelect
          value={period}
          // Cùng bảng tra mà modal dùng → header và modal không thể lệch.
          periods={CASH_FLOW_PERIODS[granularity] ?? []}
          onChange={(next) => setRow2CashFlow({ period: next })}
        />
      }
      onOpenOptions={() => setOptionsOpen(true)}
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      updatedAt={data ? new Date(data.updatedAt) : undefined}
      modal={
        <CashFlowOptionsModal
          open={optionsOpen}
          granularity={granularity}
          period={period}
          onClose={() => setOptionsOpen(false)}
          onConfirm={(next) => {
            setRow2CashFlow(next);
            setOptionsOpen(false);
          }}
        />
      }
    >
      <SummaryStatChipGroup
        items={[
          {
            key: "cashIn",
            label: "Tiền thu",
            color: CHART_COLOR.blue,
            value: data?.totals.cashIn ?? 0,
          },
          {
            key: "cashOut",
            label: "Tiền chi",
            color: CHART_COLOR.orange,
            value: data?.totals.cashOut ?? 0,
          },
          {
            key: "diff",
            label: "Chênh lệch",
            color: CHART_COLOR.green,
            value: data?.totals.diff ?? 0,
          },
        ]}
        hiddenKeys={hiddenKeys}
        onToggle={toggleSeries}
      />
      <div className="mt-6">
        <CashFlowOverTimeChart
          points={data?.points ?? []}
          granularity={bucketGranularity}
          hiddenKeys={hiddenKeys}
          loading={isFetching}
        />
      </div>
    </ChartWidgetPanel>
  );
}
