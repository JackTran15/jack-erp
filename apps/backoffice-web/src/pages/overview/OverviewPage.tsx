import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { useIsChainSelected } from "../../store/common/branch/branch.store";
import { DailyActivityPanel } from "./DailyActivityPanel/DailyActivityPanel";
import { EInvoiceStatusPanel } from "./EInvoiceStatusPanel/EInvoiceStatusPanel";
import { OverviewRow2 } from "./OverviewRow2/OverviewRow2";
import { OverviewRow3 } from "./OverviewRow3/OverviewRow3";

/** Màn hình "Tổng quan" — 3 hàng widget tổng hợp hoạt động kinh doanh. */
export function OverviewPage() {
  const isChain = useIsChainSelected();

  return (
    <AdminPageShell className="gap-4 overflow-y-auto bg-[#E5E6EB] p-2">
      {isChain ? (
        // Chuỗi cửa hàng: row 1 có thêm panel HĐĐT tách riêng bên phải.
        <div className="flex flex-col gap-4 xl:flex-row">
          {/* `grid` để panel "Hoạt động trong ngày" giãn cao bằng panel HĐĐT. */}
          <div className="grid min-w-0 flex-1">
            <DailyActivityPanel />
          </div>
          <EInvoiceStatusPanel />
        </div>
      ) : (
        <DailyActivityPanel />
      )}
      <OverviewRow2 />
      <OverviewRow3 />
    </AdminPageShell>
  );
}
