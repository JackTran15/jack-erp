import { AppHeader } from "@erp/pos/components/layout/appHeader/AppHeader";

export interface ReturnGoodsTopBarProps {
  title: string;
  location: string;
  userName: string;
}

/**
 * Minimalist topbar for stand-alone module pages such as "Đổi trả hàng".
 * Compared to {@link InvoiceTabBar} this drops the invoice-tabs row and adds
 * a plain page-title slot.
 */
export function ReturnGoodsTopBar({
  title,
  location,
  userName,
}: ReturnGoodsTopBarProps) {
  return (
    <AppHeader
      className="h-12 gap-3 bg-white px-3"
      title={title}
      location={location}
      userName={userName}
    />
  );
}
