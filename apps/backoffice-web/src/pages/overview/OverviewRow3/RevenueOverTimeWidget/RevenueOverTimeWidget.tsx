import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type {
  Granularity,
} from "../../_lib/granularity";
import type { RevenueOverTimeReport } from "../../../../store/page-stores/overview/overview.interface";
import { useOverviewStore } from "../../../../store/page-stores/overview/overview.store";
import { CHART_COLOR } from "../../_lib/echarts/baseOption";
import {
  PRODUCT_PROFIT_GRANULARITIES,
  PRODUCT_PROFIT_PERIODS,
  REVENUE_COST_PROFIT_GRANULARITIES,
  REVENUE_OVER_TIME_GRANULARITIES,
  REVENUE_OVER_TIME_PERIODS,
  keepOrResetPeriod,
  revenueCostProfitPeriods,
} from "../../_lib/granularity";
import type { OverviewPeriod } from "../../_lib/period";
import { useOverviewScope } from "../../_lib/useOverviewScope";
import { fetchProductProfit } from "../../_mock/productProfit.mock";
import { fetchRevenueCostProfitTime } from "../../_mock/revenueCostProfitTime.mock";
import { fetchRevenueOverTime } from "../../_mock/revenueOverTime.mock";
import { ChartWidgetPanel } from "../../ChartWidgetPanel/ChartWidgetPanel";
import { HeaderPeriodSelect } from "../../ChartWidgetPanel/WidgetHeader/HeaderPeriodSelect/HeaderPeriodSelect";
import { WidgetTypeSelect } from "../../ChartWidgetPanel/WidgetHeader/WidgetTypeSelect/WidgetTypeSelect";
import { SummaryStatChipGroup } from "../../SummaryStatChipGroup/SummaryStatChipGroup";
import { ProductProfitOptionsModal } from "./ProductProfitOptionsModal/ProductProfitOptionsModal";
import { ProductProfitOverTimeChart } from "./ProductProfitOverTimeChart/ProductProfitOverTimeChart";
import { RevenueCostProfitOverTimeChart } from "./RevenueCostProfitOverTimeChart/RevenueCostProfitOverTimeChart";
import { RevenueCostProfitTimeOptionsModal } from "./RevenueCostProfitTimeOptionsModal/RevenueCostProfitTimeOptionsModal";
import { RevenueOverTimeChart } from "./RevenueOverTimeChart/RevenueOverTimeChart";
import { RevenueOverTimeOptionsModal } from "./RevenueOverTimeOptionsModal/RevenueOverTimeOptionsModal";

const REPORT_OPTIONS = [
  { value: "revenue", label: "Doanh thu theo thời gian" },
  { value: "product_profit", label: "Lợi nhuận hàng hóa theo thời gian" },
  { value: "revenue_cost_profit", label: "Doanh thu, chi phí, lợi nhuận theo thời gian" },
];

/** Mỗi loại báo cáo có bộ granularity và bảng kỳ báo cáo riêng. */
function configFor(reportType: RevenueOverTimeReport) {
  if (reportType === "product_profit") {
    return {
      granularities: PRODUCT_PROFIT_GRANULARITIES,
      periods: PRODUCT_PROFIT_PERIODS,
    };
  }
  if (reportType === "revenue_cost_profit") {
    return {
      granularities: REVENUE_COST_PROFIT_GRANULARITIES,
      periods: revenueCostProfitPeriods(),
    };
  }
  return {
    granularities: REVENUE_OVER_TIME_GRANULARITIES,
    periods: REVENUE_OVER_TIME_PERIODS,
  };
}

/** Row 3 phải — ba loại báo cáo theo thời gian, mỗi loại một modal riêng. */
export function RevenueOverTimeWidget() {
  const scope = useOverviewScope();
  const state = useOverviewStore((s) => s.row3Right);
  const setRow3Right = useOverviewStore((s) => s.actions.setRow3Right);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const config = useMemo(() => configFor(state.reportType), [state.reportType]);
  const allowedPeriods = config.periods[state.granularity] ?? [];

  /**
   * Đổi loại báo cáo → granularity/kỳ cũ có thể không còn hợp lệ (vd đang ở
   * "Ngày" rồi chuyển sang loại chỉ nhận Tháng/Quý/Năm) nên phải chuẩn hoá lại.
   */
  const changeReport = (reportType: RevenueOverTimeReport) => {
    const next = configFor(reportType);
    const granularity = next.granularities.includes(state.granularity)
      ? state.granularity
      : next.granularities[0]!;
    setRow3Right({
      reportType,
      granularity,
      period: keepOrResetPeriod(state.period, next.periods[granularity] ?? []),
    });
    setHiddenKeys([]);
  };

  const revenueQuery = useQuery({
    queryKey: ["overview", "revenue-over-time", scope.key, state.granularity, state.period],
    queryFn: () =>
      fetchRevenueOverTime({
        scopeKey: scope.key,
        period: state.period,
        granularity: state.granularity,
      }),
    enabled: state.reportType === "revenue",
  });

  const profitQuery = useQuery({
    queryKey: [
      "overview",
      "product-profit",
      scope.key,
      state.granularity,
      state.period,
      state.productGroupIds,
      state.variantIds,
      state.productIds,
    ],
    queryFn: () =>
      fetchProductProfit({
        scopeKey: scope.key,
        period: state.period,
        granularity: state.granularity,
        productGroupIds: state.productGroupIds,
        variantIds: state.variantIds,
        productIds: state.productIds,
      }),
    enabled: state.reportType === "product_profit",
  });

  const rcpQuery = useQuery({
    queryKey: [
      "overview",
      "revenue-cost-profit-time",
      scope.key,
      state.granularity,
      state.period,
    ],
    queryFn: () =>
      fetchRevenueCostProfitTime({
        scopeKey: scope.key,
        period: state.period,
        granularity: state.granularity,
      }),
    enabled: state.reportType === "revenue_cost_profit",
  });

  const active =
    state.reportType === "product_profit"
      ? profitQuery
      : state.reportType === "revenue_cost_profit"
        ? rcpQuery
        : revenueQuery;

  const toggleSeries = (key: string) =>
    setHiddenKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );

  const applyGranularity = (next: { granularity: Granularity; period: OverviewPeriod }) => {
    setRow3Right(next);
    setOptionsOpen(false);
  };

  return (
    <ChartWidgetPanel
      title={
        <WidgetTypeSelect
          value={state.reportType}
          options={REPORT_OPTIONS}
          onChange={(v) => changeReport(v as RevenueOverTimeReport)}
          width={280}
        />
      }
      periodSelect={
        <HeaderPeriodSelect
          value={state.period}
          periods={allowedPeriods}
          onChange={(period) => setRow3Right({ period })}
        />
      }
      onOpenOptions={() => setOptionsOpen(true)}
      onRefresh={() => void active.refetch()}
      refreshing={active.isFetching}
      updatedAt={active.data ? new Date(active.data.updatedAt) : undefined}
      modal={
        state.reportType === "product_profit" ? (
          <ProductProfitOptionsModal
            open={optionsOpen}
            state={state}
            onClose={() => setOptionsOpen(false)}
            onConfirm={(next) => {
              setRow3Right(next);
              setOptionsOpen(false);
            }}
          />
        ) : state.reportType === "revenue_cost_profit" ? (
          <RevenueCostProfitTimeOptionsModal
            open={optionsOpen}
            granularity={state.granularity}
            period={state.period}
            onClose={() => setOptionsOpen(false)}
            onConfirm={applyGranularity}
          />
        ) : (
          <RevenueOverTimeOptionsModal
            open={optionsOpen}
            granularity={state.granularity}
            period={state.period}
            onClose={() => setOptionsOpen(false)}
            onConfirm={applyGranularity}
          />
        )
      }
    >
      {state.reportType === "product_profit" ? (
        <>
          <SummaryStatChipGroup
            items={[
              {
                key: "revenue",
                label: "Doanh thu",
                color: CHART_COLOR.blue,
                value: profitQuery.data?.totals.revenue ?? 0,
              },
              {
                key: "cogs",
                label: "Giá vốn",
                color: CHART_COLOR.orange,
                value: profitQuery.data?.totals.cogs ?? 0,
              },
              {
                key: "profit",
                label: "Lợi nhuận",
                color: CHART_COLOR.green,
                value: profitQuery.data?.totals.profit ?? 0,
              },
            ]}
            hiddenKeys={hiddenKeys}
            onToggle={toggleSeries}
          />
          <div className="mt-6">
            <ProductProfitOverTimeChart
              points={profitQuery.data?.points ?? []}
              granularity={state.granularity}
              hiddenKeys={hiddenKeys}
              loading={profitQuery.isFetching}
            />
          </div>
        </>
      ) : state.reportType === "revenue_cost_profit" ? (
        <>
          {/* Chip ở widget này CHỈ có nhãn, không kèm số — theo spec. */}
          <SummaryStatChipGroup
            items={[
              { key: "revenue", label: "Doanh thu", color: CHART_COLOR.blue },
              { key: "cost", label: "Chi phí", color: CHART_COLOR.orangeAlt },
              { key: "profit", label: "Lợi nhuận", color: CHART_COLOR.green },
            ]}
            hiddenKeys={hiddenKeys}
            onToggle={toggleSeries}
          />
          <div className="mt-8">
            <RevenueCostProfitOverTimeChart
              points={rcpQuery.data?.points ?? []}
              axisTitle={rcpQuery.data?.axisTitle ?? "Tháng"}
              hiddenKeys={hiddenKeys}
              loading={rcpQuery.isFetching}
            />
          </div>
        </>
      ) : (
        <RevenueOverTimeChart
          points={revenueQuery.data?.points ?? []}
          granularity={state.granularity}
          loading={revenueQuery.isFetching}
        />
      )}
    </ChartWidgetPanel>
  );
}
