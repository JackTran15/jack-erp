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
import type { TimeBucketGranularity } from "../../../_lib/timeBuckets";
import { timeAxisTitle } from "../../../_lib/timeBuckets";
import type { CashFlowPoint } from "../../../_mock/cashFlow.mock";

const DIVISOR = 1000;

interface Props {
  points: CashFlowPoint[];
  granularity: TimeBucketGranularity;
  hiddenKeys: string[];
  loading?: boolean;
}

/** Combo: 2 cột (Tiền thu / Tiền chi) + 1 đường có marker (Chênh lệch). */
export function CashFlowOverTimeChart({
  points,
  granularity,
  hiddenKeys,
  loading,
}: Props) {
  const option = useMemo<EChartsOption>(() => {
    const scaled = points.map((point) => ({
      cashIn: point.cashIn / DIVISOR,
      cashOut: point.cashOut / DIVISOR,
      diff: point.diff / DIVISOR,
    }));

    const visible = {
      cashIn: !hiddenKeys.includes("cashIn"),
      cashOut: !hiddenKeys.includes("cashOut"),
      diff: !hiddenKeys.includes("diff"),
    };

    const visibleValues = [
      ...(visible.cashIn ? scaled.map((r) => r.cashIn) : []),
      ...(visible.cashOut ? scaled.map((r) => r.cashOut) : []),
      ...(visible.diff ? scaled.map((r) => r.diff) : []),
    ];

    const series: NonNullable<EChartsOption["series"]> = [];
    if (visible.cashIn) {
      series.push({
        name: "Tiền thu",
        type: "bar",
        barMaxWidth: 10,
        itemStyle: {
          color: CHART_COLOR.blue,
          borderColor: CHART_COLOR.blueStroke,
          borderWidth: 1,
        },
        data: scaled.map((r) => r.cashIn),
      });
    }
    if (visible.cashOut) {
      series.push({
        name: "Tiền chi",
        type: "bar",
        barMaxWidth: 10,
        itemStyle: {
          color: CHART_COLOR.orange,
          borderColor: CHART_COLOR.orangeStroke,
          borderWidth: 1,
        },
        data: scaled.map((r) => r.cashOut),
      });
    }
    if (visible.diff) {
      series.push({
        name: "Chênh lệch",
        type: "line",
        symbol: "circle",
        symbolSize: 10,
        // Đường nối liền cả ô có giá trị 0 — không ngắt quãng.
        connectNulls: true,
        lineStyle: { color: CHART_COLOR.green, width: 2 },
        itemStyle: { color: CHART_COLOR.green },
        emphasis: { scale: 1.4 },
        z: 3,
        data: scaled.map((r) => r.diff),
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
        points.map((point) => point.label),
        granularity === "day"
          ? { rotate: -90, interval: 0 }
          : { rotate: -45, interval: 0 },
      ),
      yAxis: yAxis("Số tiền (K)", { ...niceDomain(visibleValues) }),
      series,
    };
  }, [points, granularity, hiddenKeys]);

  return (
    <EChart
      option={option}
      height={272}
      loading={loading}
      ariaLabel="Biểu đồ tình hình thu chi tiền theo thời gian"
    />
  );
}
