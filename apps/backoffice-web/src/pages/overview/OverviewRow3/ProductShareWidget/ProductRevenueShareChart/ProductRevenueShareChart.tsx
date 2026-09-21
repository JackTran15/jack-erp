import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "../../../_lib/echarts/EChart";
import { CHART_COLOR, PIE_COLORS, TOOLTIP } from "../../../_lib/echarts/baseOption";
import { formatViNumber } from "../../../_lib/format";
import type { ShareSlice } from "../../../_api/overview.interface";
import { PieLegend } from "./PieLegend/PieLegend";

/** Lát nhỏ hơn mức này thì ẩn nhãn % cho khỏi chồng chữ. */
const MIN_LABEL_PERCENT = 5;

interface Props {
  slices: ShareSlice[];
  hiddenKeys: string[];
  onToggle: (key: string) => void;
  loading?: boolean;
}

/** Pie tỉ trọng doanh thu + legend dọc bên phải. */
export function ProductRevenueShareChart({
  slices,
  hiddenKeys,
  onToggle,
  loading,
}: Props) {
  const visible = slices.filter((s) => !hiddenKeys.includes(s.key));
  const total = visible.reduce((acc, s) => acc + s.value, 0);

  const option = useMemo<EChartsOption>(() => {
    const colorOf = (slice: ShareSlice) =>
      PIE_COLORS[slices.findIndex((s) => s.key === slice.key) % PIE_COLORS.length];

    return {
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { marker: string; name: string; value: number; percent: number };
          return `${p.marker}${p.name}: ${formatViNumber(p.value)} (${Math.round(p.percent)}%)`;
        },
      },
      series: [
        {
          type: "pie",
          radius: 96,
          center: ["50%", "50%"],
          // Bắt đầu từ 12 giờ, chạy theo chiều kim đồng hồ.
          startAngle: 90,
          clockwise: true,
          avoidLabelOverlap: false,
          itemStyle: { borderColor: "#FFFFFF", borderWidth: 1 },
          label: {
            position: "inside",
            // Nhãn xoay theo góc giữa lát, đúng như hệ gốc.
            rotate: "tangential",
            color: CHART_COLOR.text,
            fontSize: 13,
            formatter: (p: { percent?: number }) =>
              (p.percent ?? 0) >= MIN_LABEL_PERCENT ? `${Math.round(p.percent ?? 0)}%` : "",
          },
          labelLine: { show: false },
          emphasis: { scaleSize: 8 },
          data: visible.map((slice) => ({
            name: slice.label,
            value: slice.value,
            itemStyle: { color: colorOf(slice) },
          })),
        },
      ],
    };
  }, [slices, visible]);

  if (!loading && total === 0) {
    return (
      <div className="flex h-[330px] items-center gap-6">
        <div className="flex h-48 w-48 shrink-0 items-center justify-center rounded-full bg-[#EEEEEE]">
          <span className="text-[13px] text-[#616161]">Chưa có dữ liệu</span>
        </div>
        <PieLegend
          slices={slices}
          colors={PIE_COLORS}
          hiddenKeys={hiddenKeys}
          onToggle={onToggle}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[330px] items-center gap-6">
      <div className="min-w-0 flex-1">
        <EChart
          option={option}
          height={330}
          loading={loading}
          ariaLabel="Biểu đồ tỉ trọng doanh thu hàng hóa"
        />
      </div>
      <PieLegend
        slices={slices}
        colors={PIE_COLORS}
        hiddenKeys={hiddenKeys}
        onToggle={onToggle}
      />
    </div>
  );
}
