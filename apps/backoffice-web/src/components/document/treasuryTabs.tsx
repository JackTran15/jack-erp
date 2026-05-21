import { Link } from "react-router-dom";
import { PageTabBar, type PageTabItem } from "@erp/ui";

export enum TreasuryCashTabIdEnum {
  RECEIPTS_EXPENSES = "receipts-expenses",
  COUNT = "count",
  LEDGER = "ledger",
}

export const TREASURY_CASH_TABS: (PageTabItem & {
  id: TreasuryCashTabIdEnum;
  comingSoon?: boolean;
})[] = [
  {
    id: TreasuryCashTabIdEnum.RECEIPTS_EXPENSES,
    label: "Thu, chi tiền mặt",
    href: "/treasury/cash/receipts-expenses",
  },
  {
    id: TreasuryCashTabIdEnum.COUNT,
    label: "Kiểm kê tiền mặt",
    href: "/treasury/cash/count",
  },
  {
    id: TreasuryCashTabIdEnum.LEDGER,
    label: "Sổ chi tiết tiền mặt",
    href: "/treasury/cash/ledger",
  },
];

export function TreasuryTabBar({
  activeId,
}: {
  activeId: TreasuryCashTabIdEnum;
}) {
  return (
    <PageTabBar
      activeId={activeId}
      items={TREASURY_CASH_TABS}
      renderItem={(item, isActive) => {
        if (isActive) {
          return <span className="font-semibold text-foreground">{item.label}</span>;
        }
        const tab = item as (typeof TREASURY_CASH_TABS)[number];
        if (tab.comingSoon) {
          return (
            <span
              className="cursor-not-allowed text-muted-foreground/70"
              title="Sắp triển khai"
            >
              {item.label}
            </span>
          );
        }
        return (
          <Link to={item.href ?? "#"} className="text-primary hover:underline">
            {item.label}
          </Link>
        );
      }}
    />
  );
}
