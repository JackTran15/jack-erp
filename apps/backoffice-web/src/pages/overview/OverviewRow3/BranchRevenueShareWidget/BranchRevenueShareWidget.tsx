import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { ShareSlice } from "../../_api/overview.interface";
import { fetchRevenueCostProfit } from "../../_api/overview.api";
import { REVENUE_WIDGET_PERIODS, type OverviewPeriod } from "../../_lib/period";
import { useOverviewScope } from "../../_lib/useOverviewScope";
import { ChartWidgetPanel } from "../../ChartWidgetPanel/ChartWidgetPanel";
import { HeaderPeriodSelect } from "../../ChartWidgetPanel/WidgetHeader/HeaderPeriodSelect/HeaderPeriodSelect";
import { ProductRevenueShareChart } from "../ProductShareWidget/ProductRevenueShareChart/ProductRevenueShareChart";

/**
 * Row 3 (chỉ chế độ chuỗi) — "Tỉ trọng doanh thu theo chi nhánh". Dùng chung
 * endpoint và queryKey với widget "Doanh thu, chi phí, lợi nhuận" của row 2.
 */
export function BranchRevenueShareWidget() {
  const scope = useOverviewScope();
  const [period, setPeriod] = useState<OverviewPeriod>("this_month");
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["overview", "revenue-cost-profit", scope.key, period],
    queryFn: () => fetchRevenueCostProfit({ branchIds: scope.branchIds, period }),
  });

  const slices = useMemo<ShareSlice[]>(() => {
    const stores = data?.byStore ?? [];
    const total = stores.reduce((acc, s) => acc + s.revenue, 0);
    // Chi nhánh doanh thu cao nhất đứng đầu legend (và nhận màu đầu bảng).
    return [...stores].sort((a, b) => b.revenue - a.revenue).map((s) => ({
      key: s.storeName,
      label: s.storeName,
      value: s.revenue,
      percent: total > 0 ? (s.revenue / total) * 100 : 0,
    }));
  }, [data]);

  const toggleSlice = (key: string) =>
    setHiddenKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );

  return (
    <ChartWidgetPanel
      title="Tỉ trọng doanh thu theo chi nhánh"
      periodSelect={
        <HeaderPeriodSelect
          value={period}
          periods={REVENUE_WIDGET_PERIODS}
          onChange={(next) => {
            setPeriod(next);
            setHiddenKeys([]);
          }}
        />
      }
      onRefresh={() => void refetch()}
      refreshing={isFetching}
      updatedAt={data ? new Date(data.updatedAt) : undefined}
    >
      <ProductRevenueShareChart
        slices={slices}
        hiddenKeys={hiddenKeys}
        onToggle={toggleSlice}
        loading={isFetching}
        showLegendValue
        ariaLabel="Biểu đồ tỉ trọng doanh thu theo chi nhánh"
      />
    </ChartWidgetPanel>
  );
}
