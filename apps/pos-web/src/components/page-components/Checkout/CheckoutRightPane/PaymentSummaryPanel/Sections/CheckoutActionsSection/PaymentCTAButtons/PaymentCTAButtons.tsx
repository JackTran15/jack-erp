import { useState } from "react";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { KeyboardHint } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/PaymentCTAButtons/KeyboardHint/KeyboardHint";
import { PrintEstimatePopover } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/PaymentCTAButtons/PrintEstimatePopover/PrintEstimatePopover";
import { useCheckoutActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-actions";
import { useCheckoutCollectState } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-collect-state";
import { useCheckoutDraft } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-draft";
import { useCheckoutEstimate } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-estimate";
import {
  selectHasAnyCartLines,
  selectIsReturnExchangeInvoice,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * Bottom payment row: save draft (sale), or icon-only cancel (return / exchange),
 * plus collect. Đọc flow hooks tương ứng — saveDraft / cancelInvoice / collect.
 */
export function PaymentCTAButtons() {
  const isReturnExchange = usePosCheckoutSessionStore(
    selectIsReturnExchangeInvoice,
  );
  const { saveDraft, isSaving } = useCheckoutDraft();
  const { finalizeCheckoutAndPrint, isFinalizing, requestCancelInvoice } =
    useCheckoutActions();
  const { printEstimate, isPrinting } = useCheckoutEstimate();
  const { collectDisabled } = useCheckoutCollectState();
  const hasCartItems = usePosCheckoutSessionStore(selectHasAnyCartLines);

  const [estimateOpen, setEstimateOpen] = useState(false);

  const busy = isSaving || isFinalizing || isPrinting;

  const handleSaveDraft = () => {
    void saveDraft();
  };

  const handleCollect = () => {
    void finalizeCheckoutAndPrint();
  };

  const handlePrintEstimate = () => {
    setEstimateOpen(false);
    void printEstimate();
  };

  return (
    <div className="flex h-14 items-stretch gap-2 px-4 py-2">
      {isReturnExchange ? (
        <button
          type="button"
          onClick={requestCancelInvoice}
          disabled={collectDisabled || busy}
          aria-label="Huỷ bỏ hoá đơn"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white transition-colors hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-600/40 disabled:cursor-not-allowed disabled:bg-orange-300/70 disabled:hover:bg-orange-300/70"
        >
          <ArrowLeftIcon size={20} aria-hidden />
        </button>
      ) : (
        <div className="relative flex basis-[35%] items-stretch">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving || !hasCartItems}
            className="inline-flex flex-1 flex-col items-center justify-center rounded-l-lg bg-[#4F46E5] text-[13px] font-semibold leading-tight text-white transition-colors hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>Lưu tạm</span>
            <KeyboardHint className="text-[11px] text-white/80">
              (F10)
            </KeyboardHint>
          </button>
          <span className="w-px bg-white/35" />
          <button
            type="button"
            onClick={() => setEstimateOpen((v) => !v)}
            disabled={busy || !hasCartItems}
            aria-label="In tạm tính"
            aria-haspopup="menu"
            aria-expanded={estimateOpen}
            className="inline-flex w-8 items-center justify-center rounded-r-lg bg-[#4F46E5] text-white transition-colors hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ChevronDownIcon size={16} className="rotate-180" aria-hidden />
          </button>
          <PrintEstimatePopover
            open={estimateOpen}
            onClose={() => setEstimateOpen(false)}
            onPick={handlePrintEstimate}
            disabled={busy || !hasCartItems}
          />
        </div>
      )}
      <button
        type="button"
        onClick={handleCollect}
        disabled={collectDisabled || busy}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#22C55E] text-[15px] font-semibold text-white transition-colors hover:bg-[#16A34A] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {isReturnExchange ? "Thanh toán" : "Thu tiền"}
        <KeyboardHint className="text-[13px] text-white/80">(F9)</KeyboardHint>
      </button>
    </div>
  );
}
