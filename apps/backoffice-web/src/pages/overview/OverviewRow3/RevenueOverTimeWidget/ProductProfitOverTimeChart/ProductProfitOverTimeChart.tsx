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
import type { Granularity } from "../../../_lib/granularity";
import { timeAxisRotate, timeAxisTitle } from "../../../_lib/timeBuckets";
import type { ProductProfitPoint } from "../../../_mock/productProfit.mock";

const DIVISOR = 1000;

interface Props {
  points: ProductProfitPoint[];
  granularity: Granularity;
  hiddenKeys: string[];
  loading?: boolean;
}

/** Combo: cột Doanh thu + cột Giá vốn + đường Lợi nhuận có marker đặc. */
export function ProductProfitOverTimeChart({
  points,
  granularity,
  hiddenKeys,
  loading,
}: Props) {
  const option = useMemo<EChartsOption>(() => {
    const scaled = points.map((p) => ({
      revenue: p.revenue / DIVISOR,
      cogs: p.cogs / DIVISOR,
      profit: p.profit / DIVISOR,
    }));

    const show = {
      revenue: !hiddenKeys.includes("revenue"),
      cogs: !hiddenKeys.includes("cogs"),
      profit: !hiddenKeys.includes("profit"),
    };

    const values = [
      ...(show.revenue ? scaled.map((r) => r.revenue) : []),
      ...(show.cogs ? scaled.map((r) => r.cogs) : []),
      ...(show.profit ? scaled.map((r) => r.profit) : []),
    ];

    const series: NonNullable<EChartsOption["series"]> = [];
    if (show.revenue) {
      series.push({
        name: "Doanh thu",
        type: "bar",
        barMaxWidth: 10,
        itemStyle: {
          color: CHART_COLOR.blue,
          borderColor: CHART_COLOR.blueStroke,
          borderWidth: 1,
        },
        data: scaled.map((r) => r.revenue),
      });
    }
    if (show.cogs) {
      series.push({
        name: "Giá vốn",
        type: "bar",
        barMaxWidth: 10,
        itemStyle: {
          color: CHART_COLOR.orange,
          borderColor: CHART_COLOR.orangeStroke,
          borderWidth: 1,
        },
        data: scaled.map((r) => r.cogs),
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
        timeAxisTitle(granularity),
        points.map((p) => p.label),
        { rotate: timeAxisRotate(granularity), interval: 0 },
      ),
      yAxis: yAxis("Số tiền (K)", { ...niceDomain(values) }),
      series,
    };
  }, [points, granularity, hiddenKeys]);

  return (
    <EChart
      option={option}
      height={250}
      loading={loading}
      ariaLabel="Biểu đồ lợi nhuận hàng hóa theo thời gian"
    />
  );
}
