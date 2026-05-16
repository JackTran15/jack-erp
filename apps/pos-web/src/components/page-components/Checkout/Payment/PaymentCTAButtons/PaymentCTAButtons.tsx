import { useState } from "react";
import { ArrowLeftIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { KeyboardHint } from "@erp/pos/components/page-components/Checkout/KeyboardHint/KeyboardHint";

export interface PaymentCTAButtonsProps {
  /** Sale mode: save draft. Omitted when {@link onCancelInvoice} is used. */
  onSaveDraft?: () => void;
  /** Return / exchange: opens cancel confirmation on the host page. */
  onCancelInvoice?: () => void;
  /**
   * "Thu tiền" — host runs validation, commits checkout, then prints if needed.
   * May be async (e.g. receipt print).
   */
  onCollect: () => void | Promise<void>;
  collectDisabled?: boolean;
}

/**
 * Bottom payment row: save draft (sale), or icon-only cancel (return / exchange),
 * plus collect. Receipt printing is owned by {@link onCollect} after validation.
 */
export function PaymentCTAButtons({
  onSaveDraft,
  onCancelInvoice,
  onCollect,
  collectDisabled,
}: PaymentCTAButtonsProps) {
  const [busy, setBusy] = useState(false);

  const handleCollect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.resolve(onCollect());
    } finally {
      setBusy(false);
    }
  };

  const showCancelInvoice = Boolean(onCancelInvoice);
  const showSaveDraft = Boolean(onSaveDraft) && !showCancelInvoice;

  return (
    <div className="flex h-14 items-stretch gap-2 px-4 py-2">
      {showCancelInvoice ? (
        <button
          type="button"
          onClick={onCancelInvoice}
          disabled={collectDisabled}
          aria-label="Huỷ bỏ hoá đơn"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white transition-colors hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600/40 disabled:cursor-not-allowed disabled:bg-orange-300/70 disabled:hover:bg-orange-300/70"
        >
          <ArrowLeftIcon size={20} aria-hidden />
        </button>
      ) : showSaveDraft ? (
        <button
          type="button"
          onClick={onSaveDraft}
          className="inline-flex basis-[35%] flex-col items-center justify-center rounded-lg bg-[#4F46E5] text-[13px] font-semibold leading-tight text-white transition-colors hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <span>Lưu tạm</span>
          <KeyboardHint className="text-[11px] text-white/80">(F10)</KeyboardHint>
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleCollect}
        disabled={collectDisabled || busy}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#22C55E] text-[15px] font-semibold text-white transition-colors hover:bg-[#16A34A] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        Thu tiền
        <KeyboardHint className="text-[13px] text-white/80">(F9)</KeyboardHint>
      </button>
    </div>
  );
}
