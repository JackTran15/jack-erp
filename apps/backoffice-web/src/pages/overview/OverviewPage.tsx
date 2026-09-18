import { AdminPageShell } from "../../components/layout/AdminPageShell";
import { DailyActivityPanel } from "./DailyActivityPanel/DailyActivityPanel";
import { OverviewRow2 } from "./OverviewRow2/OverviewRow2";

/** Màn hình "Tổng quan" — 3 hàng widget tổng hợp hoạt động kinh doanh. */
export function OverviewPage() {
  return (
    <AdminPageShell className="gap-4 overflow-y-auto bg-[#E5E6EB] p-2">
      <DailyActivityPanel />
      <OverviewRow2 />
    </AdminPageShell>
  );
}
