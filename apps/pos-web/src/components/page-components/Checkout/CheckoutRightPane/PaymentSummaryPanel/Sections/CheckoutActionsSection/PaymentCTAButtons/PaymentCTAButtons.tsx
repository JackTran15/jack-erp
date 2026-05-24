import { ArrowLeftIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { KeyboardHint } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/PaymentCTAButtons/KeyboardHint/KeyboardHint";
import { useCheckoutActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-actions";
import { useCheckoutCollectState } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-collect-state";
import { useCheckoutDraft } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-draft";
import {
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
  const { collectDisabled } = useCheckoutCollectState();

  const busy = isSaving || isFinalizing;

  const handleSaveDraft = () => {
    void saveDraft();
  };

  const handleCollect = () => {
    void finalizeCheckoutAndPrint();
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
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSaving}
          className="inline-flex basis-[35%] flex-col items-center justify-center rounded-lg bg-[#4F46E5] text-[13px] font-semibold leading-tight text-white transition-colors hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>Lưu tạm</span>
          <KeyboardHint className="text-[11px] text-white/80">(F10)</KeyboardHint>
        </button>
      )}
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
