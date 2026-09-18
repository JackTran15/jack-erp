import { ProductShareWidget } from "./ProductShareWidget/ProductShareWidget";
import { RevenueOverTimeWidget } from "./RevenueOverTimeWidget/RevenueOverTimeWidget";

/** Row 3 — tỉ trọng / hàng bán chạy bên trái, báo cáo theo thời gian bên phải. */
export function OverviewRow3() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
      <ProductShareWidget />
      <RevenueOverTimeWidget />
    </div>
  );
}
