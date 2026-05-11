import { cn } from "@erp/ui";
import { PurchaseHistoryStatusEnum } from "../../../constants/customer";
import type { PurchaseHistoryStatus } from "./types";

export interface StatusBadgeProps {
  status: PurchaseHistoryStatus;
}

/** Pill badge per spec 4.9. Add cases here when new statuses appear. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const config: Record<
    PurchaseHistoryStatus,
    { label: string; bg: string; text: string }
  > = {
    [PurchaseHistoryStatusEnum.PAID]: {
      label: "Đã thanh toán",
      bg: "bg-[#DCFCE7]",
      text: "text-[#166534]",
    },
    [PurchaseHistoryStatusEnum.DEBT]: {
      label: "Ghi nợ",
      bg: "bg-[#FEF3C7]",
      text: "text-[#92400E]",
    },
  };
  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-full px-3 text-[12px] font-semibold tracking-[0.02em]",
        c.bg,
        c.text,
      )}
    >
      {c.label}
    </span>
  );
}
