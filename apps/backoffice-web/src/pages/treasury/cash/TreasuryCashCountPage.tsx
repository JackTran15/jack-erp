import { TreasuryCashTabIdEnum } from "../../../components/document/treasuryTabs";
import { TreasuryCashPlaceholderPage } from "./TreasuryCashPlaceholderPage";

export function TreasuryCashCountPage() {
  return (
    <TreasuryCashPlaceholderPage
      activeTab={TreasuryCashTabIdEnum.COUNT}
      message="Kiểm kê tiền mặt — chức năng đang phát triển."
    />
  );
}
