import { Link } from "react-router-dom";
import { PageTabBar, type PageTabItem } from "@erp/ui";

export enum DepositTabIdEnum {
  RECEIPTS_EXPENSES = "receipts-expenses",
  RECONCILIATION = "reconciliation",
  LEDGER = "ledger",
}

export const DEPOSIT_TABS: (PageTabItem & { id: DepositTabIdEnum })[] = [
  {
    id: DepositTabIdEnum.RECEIPTS_EXPENSES,
    label: "Thu, chi tiền gửi",
    href: "/treasury/deposit/receipts-expenses",
  },
  {
    id: DepositTabIdEnum.RECONCILIATION,
    label: "Đối chiếu tiền gửi",
    href: "/treasury/deposit-reconciliation",
  },
  {
    id: DepositTabIdEnum.LEDGER,
    label: "Sổ chi tiết tiền gửi",
    href: "/treasury/deposit/ledger",
  },
];

/**
 * Sibling-page links shown next to a deposit page's own <DocumentListShell title>.
 * The active page's name is already the page title (rendered separately, larger), so
 * unlike TreasuryTabBar this renders only the OTHER two tabs — never the active one —
 * matching the MISA reference where a page's own name never repeats next to itself.
 */
export function DepositTabBar({ activeId }: { activeId: DepositTabIdEnum }) {
  const siblings = DEPOSIT_TABS.filter((tab) => tab.id !== activeId);
  return (
    <PageTabBar
      activeId=""
      items={siblings}
      renderItem={(item) => (
        <Link to={item.href ?? "#"} className="text-primary hover:underline">
          {item.label}
        </Link>
      )}
    />
  );
}
