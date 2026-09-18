import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ProductShareReport } from "../../../../store/page-stores/overview/overview.interface";
import { useOverviewStore } from "../../../../store/page-stores/overview/overview.store";
import { PRODUCT_SHARE_PERIODS } from "../../_lib/period";
import { useCategoryOptions } from "../../_lib/useCategoryOptions";
import { useOverviewScope } from "../../_lib/useOverviewScope";
import { fetchProductShare } from "../../_mock/productShare.mock";
import { fetchTopProducts } from "../../_mock/topProducts.mock";
import { ChartWidgetPanel } from "../../ChartWidgetPanel/ChartWidgetPanel";
import { HeaderPeriodSelect } from "../../ChartWidgetPanel/WidgetHeader/HeaderPeriodSelect/HeaderPeriodSelect";
import { WidgetTypeSelect } from "../../ChartWidgetPanel/WidgetHeader/WidgetTypeSelect/WidgetTypeSelect";
import { ProductRevenueShareChart } from "./ProductRevenueShareChart/ProductRevenueShareChart";
import { ProductShareOptionsModal } from "./ProductShareOptionsModal/ProductShareOptionsModal";
import { SortByBar } from "./SortByBar/SortByBar";
import { TopProductsTable } from "./TopProductsTable/TopProductsTable";

const REPORT_OPTIONS = [
  { value: "revenue_share", label: "Tỉ trọng doanh thu hàng hóa" },
  { value: "top_products", label: "Hàng hóa bán chạy" },
];

/** Row 3 trái — pie tỉ trọng doanh thu hoặc bảng hàng hóa bán chạy. */
export function ProductShareWidget() {
  const scope = useOverviewScope();
  const state = useOverviewStore((s) => s.row3Left);
  const setRow3Left = useOverviewStore((s) => s.actions.setRow3Left);

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const isTable = state.reportType === "top_products";
  // Nhãn nhóm gốc dùng làm lát pie khi "Thống kê theo" = Nhóm hàng hóa.
  const categories = useCategoryOptions(true);

  const shareQuery = useQuery({
    queryKey: [
      "overview",
      "product-share",
      scope.key,
      state.dimension,
      state.categoryId,
      state.variantId,
      state.displayMode,
      state.period,
      categories.rootLabels.length,
    ],
    queryFn: () =>
      fetchProductShare({
        scopeKey: scope.key,
        dimension: state.dimension,
        categoryLabels: categories.rootLabels,
        categoryKey: state.categoryId,
        variantKey: state.variantId,
        displayMode: state.displayMode,
        period: state.period,
      }),
    enabled: !isTable,
  });

  const tableQuery = useQuery({
    queryKey: [
      "overview",
      "top-products",
      scope.key,
      state.categoryId,
      state.variantId,
      state.displayMode,
      state.period,
      state.sortBy,
    ],
    queryFn: () =>
      fetchTopProducts({
        scopeKey: scope.key,
        categoryKey: state.categoryId,
        variantKey: state.variantId,
        displayMode: state.displayMode,
        period: state.period,
        sortBy: state.sortBy,
      }),
    enabled: isTable,
  });

  const active = isTable ? tableQuery : shareQuery;

  const toggleSlice = (key: string) =>
    setHiddenKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );

  return (
    <ChartWidgetPanel
      title={
        <WidgetTypeSelect
          value={state.reportType}
          options={REPORT_OPTIONS}
          onChange={(v) => setRow3Left({ reportType: v as ProductShareReport })}
          // Spec ghi 200px nhưng "Tỉ trọng doanh thu hàng hóa" bị cắt sát ở mức
          // đó — thêm 10px vừa đủ hiện hết nhãn dài nhất.
          width={210}
        />
      }
      periodSelect={
        <HeaderPeriodSelect
          value={state.period}
          periods={PRODUCT_SHARE_PERIODS}
          onChange={(next) => setRow3Left({ period: next })}
        />
      }
      onOpenOptions={() => setOptionsOpen(true)}
      onRefresh={() => void active.refetch()}
      refreshing={active.isFetching}
      updatedAt={active.data ? new Date(active.data.updatedAt) : undefined}
      toolbar={
        isTable ? (
          <SortByBar
            value={state.sortBy}
            onChange={(sortBy) => setRow3Left({ sortBy })}
            disabled={tableQuery.isFetching}
          />
        ) : null
      }
      modal={
        <ProductShareOptionsModal
          open={optionsOpen}
          state={state}
          onClose={() => setOptionsOpen(false)}
          onConfirm={(next) => {
            setRow3Left(next);
            setHiddenKeys([]);
            setOptionsOpen(false);
          }}
        />
      }
    >
      {isTable ? (
        <TopProductsTable
          rows={tableQuery.data?.rows ?? []}
          loading={tableQuery.isFetching}
          error={tableQuery.isError}
          onRetry={() => void tableQuery.refetch()}
          resetScrollKey={state.sortBy}
        />
      ) : (
        <ProductRevenueShareChart
          slices={shareQuery.data?.slices ?? []}
          hiddenKeys={hiddenKeys}
          onToggle={toggleSlice}
          loading={shareQuery.isFetching}
        />
      )}
    </ChartWidgetPanel>
  );
}
