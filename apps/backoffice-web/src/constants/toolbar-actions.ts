import type { ComponentType } from "react";
import {
  CloudDownload,
  CloudUpload,
  Copy,
  History,
  PackageX,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  SquareMinus,
  SquarePlus,
  Trash2,
  Wrench,
} from "lucide-react";

/**
 * Shared toolbar action ids.
 */
export const TOOLBAR_ACTION = {
  create: "create",
  duplicate: "duplicate",
  edit: "edit",
  delete: "delete",
  refresh: "refresh",
  expand: "expand",
  collapse: "collapse",
  import: "import",
  export: "export",
  printLabel: "printLabel",
  utilities: "utilities",
  stockoutStatus: "stockoutStatus",
  transactionHistory: "transactionHistory",
} as const;

export type ToolbarActionId = (typeof TOOLBAR_ACTION)[keyof typeof TOOLBAR_ACTION];

export type ToolbarRegistryEntry = {
  id: ToolbarActionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  variant?: "danger";
};

export const TOOLBAR_REGISTRY = {
  [TOOLBAR_ACTION.create]: {
    id: TOOLBAR_ACTION.create,
    label: "Thêm mới",
    icon: Plus,
  },
  [TOOLBAR_ACTION.duplicate]: {
    id: TOOLBAR_ACTION.duplicate,
    label: "Nhân bản",
    icon: Copy,
  },
  [TOOLBAR_ACTION.edit]: {
    id: TOOLBAR_ACTION.edit,
    label: "Sửa",
    icon: Pencil,
  },
  [TOOLBAR_ACTION.delete]: {
    id: TOOLBAR_ACTION.delete,
    label: "Xóa",
    icon: Trash2,
    variant: "danger" as const,
  },
  [TOOLBAR_ACTION.refresh]: {
    id: TOOLBAR_ACTION.refresh,
    label: "Nạp",
    icon: RefreshCw,
  },
  [TOOLBAR_ACTION.expand]: {
    id: TOOLBAR_ACTION.expand,
    label: "Mở rộng",
    icon: SquarePlus,
  },
  [TOOLBAR_ACTION.collapse]: {
    id: TOOLBAR_ACTION.collapse,
    label: "Thu gọn",
    icon: SquareMinus,
  },
  [TOOLBAR_ACTION.import]: {
    id: TOOLBAR_ACTION.import,
    label: "Nhập khẩu",
    icon: CloudUpload,
  },
  [TOOLBAR_ACTION.export]: {
    id: TOOLBAR_ACTION.export,
    label: "Xuất khẩu",
    icon: CloudDownload,
  },
  [TOOLBAR_ACTION.printLabel]: {
    id: TOOLBAR_ACTION.printLabel,
    label: "In tem mã",
    icon: Printer,
  },
  [TOOLBAR_ACTION.utilities]: {
    id: TOOLBAR_ACTION.utilities,
    label: "Tiện ích",
    icon: Wrench,
  },
  [TOOLBAR_ACTION.stockoutStatus]: {
    id: TOOLBAR_ACTION.stockoutStatus,
    label: "Trạng thái hết hàng",
    icon: PackageX,
  },
  [TOOLBAR_ACTION.transactionHistory]: {
    id: TOOLBAR_ACTION.transactionHistory,
    label: "Xem lịch sử giao dịch",
    icon: History,
  },
} as const satisfies Record<ToolbarActionId, ToolbarRegistryEntry>;
