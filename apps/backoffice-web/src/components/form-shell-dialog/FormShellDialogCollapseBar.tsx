import { cn } from "@erp/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useFormShellDialogCollapse } from "./form-shell-dialog-collapse-context";

export interface FormShellDialogCollapseBarProps {
  collapseLabel?: string;
  expandLabel?: string;
  className?: string;
}

export function FormShellDialogCollapseBar({
  collapseLabel = "Thu gọn",
  expandLabel = "Mở rộng",
  className,
}: FormShellDialogCollapseBarProps) {
  const { collapsed, setCollapsed } = useFormShellDialogCollapse();

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"
      />
      <button
        type="button"
        className={cn(
          "relative z-10 mx-auto flex items-center gap-1 rounded border bg-background px-3 py-0.5 text-xs font-medium text-indigo-600 shadow-sm hover:bg-gray-100",
        )}
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? expandLabel : collapseLabel}
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
