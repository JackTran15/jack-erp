/**
 * Token dùng chung cho mọi chart của trang Tổng quan, để 6 chart không lặp lại
 * cấu hình trục/lưới/tooltip. Màu lấy từ spec trong `local/todo/tong_quan/`.
 */
import type { EChartsOption } from "echarts";
import { formatViNumber } from "../format";

export const CHART_COLOR = {
  border: "#E0E0E0",
  axisLine: "#212121",
  text: "#212121",
  textMuted: "#616161",
  /** Series xanh dương nhạt — Doanh thu / Tiền thu (row 2, chip row 3). */
  blue: "#2F8FE0",
  blueStroke: "#1F6DB0",
  /** Series xanh dương đậm — cột Doanh thu (row 3). */
  blueDark: "#0B63B0",
  blueDarkStroke: "#084A85",
  orange: "#E07B22",
  orangeStroke: "#B8601A",
  /** Cam của widget "Doanh thu, chi phí, lợi nhuận theo thời gian". */
  orangeAlt: "#EB7A30",
  green: "#5BA320",
  greenStroke: "#43801A",
  markerFill: "#FFFFFF",
  markerStroke: "#0B4F8A",
  disabled: "#BDBDBD",
  disabledText: "#9E9E9E",
} as const;

/** Bảng màu lát pie (row 3 left). */
export const PIE_COLORS = ["#33B5F5", "#B53BE0", "#10B25A", "#0B6FA3"] as const;

const AXIS_LABEL = { color: CHART_COLOR.text, fontSize: 12 } as const;
const AXIS_NAME = {
  color: CHART_COLOR.text,
  fontSize: 12,
  fontWeight: 700,
} as const;

/** Trục Y chuẩn: tên nằm trên trục, căn trái; lưới ngang mảnh. */
export function yAxis(name: string, extra?: Record<string, unknown>) {
  return {
    type: "value" as const,
    name,
    nameLocation: "end" as const,
    nameGap: 12,
    nameTextStyle: { ...AXIS_NAME, align: "left" as const },
    axisLine: { show: true, lineStyle: { color: CHART_COLOR.axisLine } },
    axisTick: { show: false },
    axisLabel: { ...AXIS_LABEL, margin: 8 },
    splitLine: { lineStyle: { color: CHART_COLOR.border } },
    ...extra,
  };
}

/** Trục X category chuẩn: tên căn phải dưới nhãn, lưới dọc tại tâm category. */
export function xAxis(
  name: string,
  data: string[],
  extra?: { rotate?: number; interval?: number | "auto"; splitLine?: boolean },
) {
  return {
    type: "category" as const,
    name,
    nameLocation: "end" as const,
    nameTextStyle: { ...AXIS_NAME, align: "right" as const },
    data,
    axisLine: {
      // Mặc định của ECharts là `onZero: true` → khi miền Y có giá trị âm, trục
      // X bị kéo lên mức 0 giữa biểu đồ và vẽ xuyên qua nhãn category. Ghim trục
      // xuống đáy lưới, đúng spec ("trục X dưới cùng, ở mức thấp nhất").
      onZero: false,
      lineStyle: { color: CHART_COLOR.axisLine },
    },
    axisTick: { show: false },
    axisLabel: {
      ...AXIS_LABEL,
      // Đẩy nhãn xuống dưới đường trục cho khỏi dính.
      margin: 10,
      rotate: extra?.rotate ?? 0,
      interval: extra?.interval ?? "auto",
      hideOverlap: extra?.interval === 0 ? false : true,
    },
    splitLine: {
      show: extra?.splitLine ?? true,
      lineStyle: { color: CHART_COLOR.border },
    },
  };
}

/** Tooltip trắng viền mảnh, dùng chung cho mọi chart. */
export const TOOLTIP: NonNullable<EChartsOption["tooltip"]> = {
  trigger: "axis",
  axisPointer: { type: "line", lineStyle: { color: CHART_COLOR.disabled } },
  backgroundColor: "#FFFFFF",
  borderColor: CHART_COLOR.border,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: CHART_COLOR.text, fontSize: 12 },
  extraCssText: "box-shadow: 0 2px 8px rgba(0,0,0,0.15);",
};

/**
 * Miền trục Y dùng chung: làm tròn RA NGOÀI tới bội số đẹp và luôn bao gồm 0.
 * Không ép đối xứng — khớp cả mẫu row 2 ([-400, 400]) lẫn row 3 ([-100, 700]).
 */
export function niceDomain(values: number[]): {
  min: number;
  max: number;
  interval: number;
} {
  const finite = values.filter((v) => Number.isFinite(v));
  const rawMin = Math.min(0, ...finite);
  const rawMax = Math.max(0, ...finite);
  const span = rawMax - rawMin;

  if (span === 0) return { min: -1, max: 1, interval: 1 };

  // Bước chia "đẹp": 1/2/5 × 10^n, nhắm khoảng 4–8 vạch.
  const rough = span / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow;

  return {
    min: Math.floor(rawMin / step) * step,
    max: Math.ceil(rawMax / step) * step,
    interval: step,
  };
}

/** Formatter tooltip nhiều series: dòng tiêu đề + "● Tên: giá trị". */
export function axisTooltipFormatter(
  params: unknown,
  divisor = 1,
): string {
  const rows = Array.isArray(params) ? params : [params];
  const first = rows[0] as { axisValueLabel?: string } | undefined;
  const head = first?.axisValueLabel ?? "";
  const body = rows
    .map((p) => {
      const row = p as { marker: string; seriesName: string; value: number };
      return `${row.marker}${row.seriesName}: ${formatViNumber(
        (row.value ?? 0) * divisor,
      )}`;
    })
    .join("<br/>");
  return `<strong>${head}</strong><br/>${body}`;
}
