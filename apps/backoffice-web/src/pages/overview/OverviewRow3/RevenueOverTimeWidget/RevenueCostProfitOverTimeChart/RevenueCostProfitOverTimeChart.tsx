import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "../../../_lib/echarts/EChart";
import {
  CHART_COLOR,
  TOOLTIP,
  axisTooltipFormatter,
  niceDomain,
  xAxis,
  yAxis,
} from "../../../_lib/echarts/baseOption";
import type { RevenueCostProfitPoint } from "../../../_mock/revenueCostProfitTime.mock";

const DIVISOR = 1_000_000;

interface Props {
  points: RevenueCostProfitPoint[];
  axisTitle: string;
  hiddenKeys: string[];
  loading?: boolean;
}

/**
 * Combo doanh thu / chi phí / lợi nhuận theo thời gian.
 * Khác widget row 2: cột doanh thu dùng xanh ĐẬM, và đường lợi nhuận vẽ ĐÈ lên cột.
 */
export function RevenueCostProfitOverTimeChart({
  points,
  axisTitle,
  hiddenKeys,
  loading,
}: Props) {
  const option = useMemo<EChartsOption>(() => {
    const scaled = points.map((p) => ({
      revenue: p.revenue / DIVISOR,
      cost: p.cost / DIVISOR,
      profit: p.profit / DIVISOR,
    }));

    const show = {
      revenue: !hiddenKeys.includes("revenue"),
      cost: !hiddenKeys.includes("cost"),
      profit: !hiddenKeys.includes("profit"),
    };

    const values = [
      ...(show.revenue ? scaled.map((r) => r.revenue) : []),
      ...(show.cost ? scaled.map((r) => r.cost) : []),
      ...(show.profit ? scaled.map((r) => r.profit) : []),
    ];

    const series: NonNullable<EChartsOption["series"]> = [];
    if (show.revenue) {
      series.push({
        name: "Doanh thu",
        type: "bar",
        barMaxWidth: 26,
        barGap: "10%",
        itemStyle: {
          color: CHART_COLOR.blueDark,
          borderColor: CHART_COLOR.blueDarkStroke,
          borderWidth: 1,
        },
        data: scaled.map((r) => r.revenue),
      });
    }
    if (show.cost) {
      series.push({
        name: "Chi phí",
        type: "bar",
        barMaxWidth: 26,
        itemStyle: {
          color: CHART_COLOR.orangeAlt,
          borderColor: CHART_COLOR.orangeStroke,
          borderWidth: 1,
        },
        data: scaled.map((r) => r.cost),
      });
    }
    if (show.profit) {
      series.push({
        name: "Lợi nhuận",
        type: "line",
        symbol: "circle",
        symbolSize: 10,
        connectNulls: true,
        lineStyle: { color: CHART_COLOR.green, width: 2 },
        itemStyle: { color: CHART_COLOR.green },
        z: 3,
        data: scaled.map((r) => r.profit),
      });
    }

    return {
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        formatter: (params: unknown) => axisTooltipFormatter(params, DIVISOR),
      },
      xAxis: xAxis(
        axisTitle,
        points.map((p) => p.label),
        { rotate: 0, interval: 0 },
      ),
      yAxis: yAxis("Số tiền (triệu)", { ...niceDomain(values) }),
      series,
    };
  }, [points, axisTitle, hiddenKeys]);

  return (
    <EChart
      option={option}
      height={280}
      loading={loading}
      ariaLabel="Biểu đồ doanh thu, chi phí, lợi nhuận theo thời gian"
    />
  );
}
