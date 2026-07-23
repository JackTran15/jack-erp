import {
  ArrowRightLeft,
  Barcode,
  EyeOff,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import type { ToolbarItem } from "@erp/ui";

interface ToolbarOptions {
  isFetching: boolean;
  hasSelection: boolean;
  /** True khi selection có ít nhất 1 hàng đang theo dõi (còn ngừng theo dõi được). */
  canStopTracking: boolean;
  onReload: () => void;
  onStopTracking: () => void;
  onOpenArrange: () => void;
  onOpenTransfer: () => void;
  onPrintLabel: () => void;
}

export function buildItemLocationToolbarItems({
  isFetching,
  hasSelection,
  canStopTracking,
  onReload,
  onStopTracking,
  onOpenArrange,
  onOpenTransfer,
  onPrintLabel,
}: ToolbarOptions): ToolbarItem[] {
  return [
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: onReload,
      disabled: isFetching,
    },
    {
      id: "stop-watch",
      label: "Ngừng theo dõi",
      icon: EyeOff,
      onClick: onStopTracking,
      disabled: !canStopTracking,
      tooltip: !hasSelection
        ? "Chọn dòng để dùng tính năng này"
        : canStopTracking
          ? undefined
          : "Hàng đã ngừng theo dõi",
    },
    {
      id: "arrange",
      label: "Xếp vị trí hàng hóa",
      icon: PackageOpen,
      onClick: onOpenArrange,
    },
    {
      id: "transfer",
      label: "Chuyển vị trí hàng hóa",
      icon: ArrowRightLeft,
      onClick: onOpenTransfer,
    },
    {
      id: "print-label",
      label: "In tem mã",
      icon: Barcode,
      onClick: onPrintLabel,
      disabled: !hasSelection,
      tooltip: hasSelection ? undefined : "Chọn dòng để dùng tính năng này",
    },
  ];
}
