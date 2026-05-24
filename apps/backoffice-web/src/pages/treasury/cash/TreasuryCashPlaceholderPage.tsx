import { DocumentListShell } from "@erp/ui";
import {
  TreasuryCashTabIdEnum,
  TreasuryTabBar,
} from "../../../components/document/treasuryTabs";

interface Props {
  activeTab: TreasuryCashTabIdEnum;
  message: string;
}

export function TreasuryCashPlaceholderPage({ activeTab, message }: Props) {
  return (
    <DocumentListShell
      title="Tiền mặt"
      tabs={<TreasuryTabBar activeId={activeTab} />}
    >
      <div className="flex min-h-[240px] items-center justify-center px-6 py-12 text-center text-muted-foreground">
        {message}
      </div>
    </DocumentListShell>
  );
}
