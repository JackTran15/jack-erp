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
import type { RevenuePoint } from "../../../_api/overview.interface";

/** Chia triệu — trục Y ghi "Số tiền (triệu)". */
const DIVISOR = 1_000_000;

interface Props {
  points: RevenuePoint[];
  granularity: Granularity;
  loading?: boolean;
}

/** Cột doanh thu, mỗi cột có marker tròn RỖNG ở đỉnh. */
export function RevenueOverTimeChart({ points, granularity, loading }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const values = points.map((p) => p.revenue / DIVISOR);

    return {
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      tooltip: {
        ...TOOLTIP,
        formatter: (params: unknown) => axisTooltipFormatter(params, DIVISOR),
      },
      xAxis: xAxis(
        timeAxisTitle(granularity),
        points.map((p) => p.label),
        { rotate: timeAxisRotate(granularity) },
      ),
      yAxis: yAxis("Số tiền (triệu)", { ...niceDomain(values) }),
      series: [
        {
          name: "Doanh thu",
          type: "bar",
          barCategoryGap: "10%",
          itemStyle: {
            color: CHART_COLOR.blueDark,
            borderColor: CHART_COLOR.blueDarkStroke,
            borderWidth: 1,
          },
          data: values,
        },
        {
          // Marker đỉnh cột: series line ẩn đường, chỉ còn điểm tròn rỗng.
          name: "Doanh thu",
          type: "line",
          symbol: "circle",
          symbolSize: 10,
          lineStyle: { width: 0 },
          itemStyle: {
            color: CHART_COLOR.markerFill,
            borderColor: CHART_COLOR.markerStroke,
            borderWidth: 1.5,
          },
          tooltip: { show: false },
          z: 3,
          data: values,
        },
      ],
    };
  }, [points, granularity]);

  return (
    <EChart
      option={option}
      height={330}
      loading={loading}
      ariaLabel="Biểu đồ doanh thu theo thời gian"
    />
  );
}
