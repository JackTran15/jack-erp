import type { LucideIcon } from "lucide-react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@erp/ui";

export interface WizardFooterAction {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "outline";
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
}

interface Props {
  actions: WizardFooterAction[];
  onCancel: () => void;
  onHelp?: () => void;
}

const MISA_PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded border border-transparent bg-[#1e3a6e] px-4 text-sm font-medium text-white transition-colors hover:bg-[#172e57] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-gray-300 disabled:text-gray-500";

const MISA_OUTLINE =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded border border-[#1e3a6e] bg-white px-4 text-sm font-medium text-[#1e3a6e] transition-colors hover:bg-[#1e3a6e]/5 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400";

export function ImportWizardFooter({ actions, onCancel, onHelp }: Props) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm text-[#2563eb] hover:underline"
        onClick={onHelp}
      >
        <HelpCircle className="h-4 w-4" />
        Trợ giúp
      </button>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const iconEl = Icon ? <Icon className="h-4 w-4 shrink-0" /> : null;
          const isPrimary = action.variant !== "outline";

          return (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled || action.loading}
              className={cn(isPrimary ? MISA_PRIMARY : MISA_OUTLINE)}
              onClick={action.onClick}
            >
              {action.iconPosition !== "right" ? iconEl : null}
              {action.loading ? "Đang xử lý…" : action.label}
              {action.iconPosition === "right" ? iconEl : null}
            </button>
          );
        })}
        <button type="button" className={MISA_OUTLINE} onClick={onCancel}>
          <X className="h-4 w-4" />
          Hủy bỏ
        </button>
      </div>
    </div>
  );
}
