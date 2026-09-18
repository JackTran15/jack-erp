import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

// Đăng ký một lần cho toàn trang Tổng quan — chỉ những phần thực sự dùng, để
// bundle không kéo cả echarts.
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface Props {
  option: EChartsOption;
  height: number;
  /** Hiện spinner của echarts thay vì nội dung chart. */
  loading?: boolean;
  className?: string;
  /** Mô tả dữ liệu cho screen reader. */
  ariaLabel?: string;
}

export function EChart({ option, height, loading, className, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | undefined>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    // `true` = notMerge: option của các loại báo cáo khác nhau không trộn lẫn.
    chartRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (loading) chart.showLoading("default", { color: "#2B2E6E", text: "" });
    else chart.hideLoading();
  }, [loading]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ height, width: "100%" }}
    />
  );
}
