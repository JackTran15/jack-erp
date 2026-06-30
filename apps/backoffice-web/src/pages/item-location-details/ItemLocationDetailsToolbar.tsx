import {
  ArrowRightLeft,
  EyeOff,
  PackageOpen,
  Printer,
  RefreshCw,
} from "lucide-react";
import type { ToolbarItem } from "@erp/ui";

interface ToolbarOptions {
  isFetching: boolean;
  hasSelection: boolean;
  onReload: () => void;
  onStopWatching: () => void;
  onOpenArrange: () => void;
  onOpenTransfer: () => void;
}

export function buildItemLocationToolbarItems({
  isFetching,
  hasSelection,
  onReload,
  onStopWatching,
  onOpenArrange,
  onOpenTransfer,
}: ToolbarOptions): ToolbarItem[] {
  const selectionTooltip = hasSelection
    ? undefined
    : "Chọn dòng để dùng tính năng này";
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
      onClick: onStopWatching,
      disabled: !hasSelection || isFetching,
      tooltip: selectionTooltip,
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
      icon: Printer,
      onClick: () => {},
      disabled: true,
      tooltip: selectionTooltip,
    },
  ];
}
