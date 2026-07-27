import { cn } from "@erp/ui";
import { PrinterIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface PrintSettingsActionsProps {
  isPrinting: boolean;
  isDirty: boolean;
  onPrintTest: () => void;
  onReset: () => void;
  onCopyDefaults: () => void;
}

const BUTTON_BASE =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function PrintSettingsActions({
  isPrinting,
  isDirty,
  onPrintTest,
  onReset,
  onCopyDefaults,
}: PrintSettingsActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onPrintTest}
        disabled={isPrinting}
        className={cn(BUTTON_BASE, "bg-[#5B5BD6] text-white hover:bg-[#4A4ABF]")}
      >
        <PrinterIcon size={16} />
        {isPrinting ? "Đang in..." : "In thử"}
      </button>

      <button
        type="button"
        onClick={onCopyDefaults}
        className={cn(
          BUTTON_BASE,
          "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
        )}
      >
        Copy JSON
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={!isDirty}
        className={cn(
          BUTTON_BASE,
          "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
        )}
      >
        Đặt lại mặc định
      </button>
    </div>
  );
}
