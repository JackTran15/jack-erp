import { TreasuryCashTabIdEnum } from "../../../components/document/treasuryTabs";
import { TreasuryCashPlaceholderPage } from "./TreasuryCashPlaceholderPage";

export function TreasuryCashReceiptsPage() {
  return (
    <TreasuryCashPlaceholderPage
      activeTab={TreasuryCashTabIdEnum.RECEIPTS_EXPENSES}
      message="Thu, chi tiền mặt — chức năng đang phát triển."
    />
  );
}
