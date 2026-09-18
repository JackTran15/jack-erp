import { ProductShareWidget } from "./ProductShareWidget/ProductShareWidget";

/** Row 3 — widget trái (tỉ trọng / hàng bán chạy); widget phải làm ở phase sau. */
export function OverviewRow3() {
  return (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
      <ProductShareWidget />
    </div>
  );
}
