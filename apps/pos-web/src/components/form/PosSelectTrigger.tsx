import type { ReactNode } from "react";
import { DropdownButton } from "@erp/pos/features/checkout/components/common/DropdownButton";

export interface PosSelectTriggerProps {
  children: ReactNode;
  leading?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function PosSelectTrigger({
  children,
  leading,
  onClick,
  className,
}: PosSelectTriggerProps) {
  return (
    <DropdownButton onClick={onClick} leading={leading} className={className}>
      {children}
    </DropdownButton>
  );
}
