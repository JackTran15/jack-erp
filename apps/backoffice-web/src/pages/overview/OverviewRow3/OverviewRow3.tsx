import { useIsChainSelected } from "../../../store/common/branch/branch.store";
import { BranchRevenueShareWidget } from "./BranchRevenueShareWidget/BranchRevenueShareWidget";
import { ProductShareWidget } from "./ProductShareWidget/ProductShareWidget";
import { RevenueOverTimeWidget } from "./RevenueOverTimeWidget/RevenueOverTimeWidget";

/** Row 3 — tỉ trọng / hàng bán chạy bên trái, báo cáo theo thời gian bên phải. */
export function OverviewRow3() {
  const isChain = useIsChainSelected();

  if (isChain) {
    // Chuỗi cửa hàng: tỉ trọng theo chi nhánh đứng đầu, báo cáo theo thời gian
    // xuống hàng riêng full width.
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
          <BranchRevenueShareWidget />
          <ProductShareWidget />
        </div>
        <RevenueOverTimeWidget />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
      <ProductShareWidget />
      <RevenueOverTimeWidget />
    </div>
  );
}
