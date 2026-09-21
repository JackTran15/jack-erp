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
import type { StoreRevenuePoint } from "../../../_api/overview.interface";

/** Chia nghìn — trục Y ghi "Số tiền (K)". */
const DIVISOR = 1000;

interface Props {
  points: StoreRevenuePoint[];
  hiddenKeys: string[];
  loading?: boolean;
}

/** Cột cụm doanh thu / chi phí / lợi nhuận theo từng cửa hàng. */
export function RevenueCostProfitChart({ points, hiddenKeys, loading }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const series = [
      { key: "revenue", name: "Doanh thu", color: CHART_COLOR.blue, stroke: CHART_COLOR.blueStroke },
      { key: "cost", name: "Chi phí", color: CHART_COLOR.orange, stroke: CHART_COLOR.orangeStroke },
      { key: "profit", name: "Lợi nhuận", color: CHART_COLOR.green, stroke: CHART_COLOR.greenStroke },
    ].filter((s) => !hiddenKeys.includes(s.key));

    const scaled = points.map((point) => ({
      revenue: point.revenue / DIVISOR,
      cost: point.cost / DIVISOR,
      profit: point.profit / DIVISOR,
    }));

    const visibleValues = series.flatMap((s) =>
      scaled.map((row) => row[s.key as keyof (typeof scaled)[number]]),
    );
    const domain = niceDomain(visibleValues);

    return {
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        formatter: (params: unknown) => axisTooltipFormatter(params, DIVISOR),
      },
      xAxis: xAxis(
        "Cửa hàng",
        points.map((point) => point.storeName),
        { rotate: -45 },
      ),
      yAxis: yAxis("Số tiền (K)", { ...domain }),
      series: series.map((s) => ({
        name: s.name,
        type: "bar" as const,
        barMaxWidth: 32,
        itemStyle: { color: s.color, borderColor: s.stroke, borderWidth: 1 },
        emphasis: { itemStyle: { opacity: 0.85 } },
        data: scaled.map((row) => row[s.key as keyof (typeof scaled)[number]]),
      })),
    };
  }, [points, hiddenKeys]);

  return (
    <EChart
      option={option}
      height={260}
      loading={loading}
      ariaLabel="Biểu đồ doanh thu, chi phí, lợi nhuận theo cửa hàng"
    />
  );
}
