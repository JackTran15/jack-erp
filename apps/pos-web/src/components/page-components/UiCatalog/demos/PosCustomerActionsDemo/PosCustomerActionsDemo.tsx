import { useState } from "react";
import { PosCustomerActions } from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";
import {
  GiftIcon,
  QrIcon,
  ReceiptIcon,
  UserPlusIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { toast } from "sonner";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosCustomerActionsDemo = () => {
  const [promo, setPromo] = useState(false);

  return (
    <div className="inline-flex items-center gap-1.5">
      <PosCustomerActions
        actions={[
          {
            key: "qr",
            icon: <QrIcon size={18} />,
            ariaLabel: "Quét QR khách hàng",
            onClick: () => toast.info("Quét QR"),
          },
          {
            key: "add",
            icon: <UserPlusIcon size={18} />,
            ariaLabel: "Thêm khách hàng",
            onClick: () => toast.info("Thêm khách hàng"),
          },
          {
            key: "history",
            icon: <ReceiptIcon size={18} />,
            ariaLabel: "Lịch sử mua hàng",
            onClick: () => toast.info("Lịch sử"),
          },
          {
            key: "promo",
            icon: <GiftIcon size={18} />,
            ariaLabel: "Khuyến mãi",
            isToggled: promo,
            onClick: () => setPromo((p) => !p),
          },
        ]}
      />
    </div>
  );
};

export const posCustomerActionsEntry: CatalogEntry = {
  id: "pos-customer-actions",
  name: "PosCustomerActions",
  category: "domain",
  importPath: "@erp/pos/components/common/PosCustomerActions/PosCustomerActions",
  description:
    "Cụm nút hành động nhanh quanh ô khách hàng (QR, thêm KH, lịch sử, voucher…). Thuần hiển thị — mọi hành vi đến từ chính các action item. Hỗ trợ split-button kèm popover.",
  props: [
    { name: "actions", type: "CustomerActionItem[]", required: true, description: "Danh sách hành động: { key, icon, ariaLabel, onClick?, isToggled?, disabled?, secondary?, popover?, triggerRef? }." },
  ],
  usageNotes: [
    "Mỗi action: icon + ariaLabel bắt buộc; isToggled để tô nhấn khi popover/menu đang mở.",
    "Đặt secondary (+ popover) để biến một mục thành split-button với menu phụ.",
    "Mỗi nút render bằng PosIconButton bên trong.",
  ],
  code: `<PosCustomerActions
  actions={[
    { key: "qr", icon: <QrIcon size={18} />, ariaLabel: "Quét QR", onClick: scan },
    { key: "add", icon: <UserPlusIcon size={18} />, ariaLabel: "Thêm KH", onClick: add },
  ]}
/>`,
  Demo: PosCustomerActionsDemo,
};
