import { KeyboardHint } from "../common/KeyboardHint";

export interface PaymentCTAButtonsProps {
  onSaveDraft: () => void;
  onCollect: () => void;
  collectDisabled?: boolean;
}

/**
 * "Lưu tạm" (secondary, narrower) + "Thu tiền" (primary green CTA) row,
 * pinned at the bottom of the payment panel.
 */
export function PaymentCTAButtons({
  onSaveDraft,
  onCollect,
  collectDisabled,
}: PaymentCTAButtonsProps) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="button"
        onClick={onSaveDraft}
        className="inline-flex h-12 basis-2/5 flex-col items-center justify-center rounded-md bg-gray-200 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
      >
        <span>Lưu tạm</span>
        <KeyboardHint className="text-[11px] text-gray-500">(F10)</KeyboardHint>
      </button>
      <button
        type="button"
        onClick={onCollect}
        disabled={collectDisabled}
        className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md bg-green-500 text-[14px] font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40"
      >
        Thu tiền <KeyboardHint className="text-[12px] text-white/80">(F9)</KeyboardHint>
      </button>
    </div>
  );
}
