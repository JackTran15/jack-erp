import { useState } from "react";
import { KeyboardHint } from "../common/KeyboardHint";
import type { InvoicePrinter } from "../printing/InvoicePrinter";
import type { InvoicePayload } from "../printing/types";
import { useInvoicePrinter } from "../printing/useInvoicePrinter";

/**
 * Either a ready payload, or a factory invoked at click time so the caller
 * can capture *current* cart/customer state before it gets reset by `onCollect`.
 * Returning `null` from the factory skips printing (e.g. when the user has
 * the "In hóa đơn" toggle off).
 */
export type InvoicePayloadInput =
  | InvoicePayload
  | (() => InvoicePayload | null);

export interface PaymentCTAButtonsProps {
  onSaveDraft: () => void;
  onCollect: () => void;
  collectDisabled?: boolean;

  /** When provided, "Thu tiền" prints the receipt before invoking onCollect. */
  invoice?: InvoicePayloadInput;
  /** Per-call printer override (DI seam for tests / future thermal/PDF strategies). */
  printer?: InvoicePrinter;
}

/**
 * "Lưu tạm" (secondary, narrower) + "Thu tiền" (primary green CTA) row,
 * pinned at the bottom of the payment panel.
 *
 * Printing is opt-in: pass an `invoice` payload (or factory) and the receipt
 * is printed via `useInvoicePrinter()` *before* `onCollect` runs. The default
 * printer uses the browser print dialog; swap it via `setDefaultInvoicePrinter`
 * or by passing a `printer` prop without touching this component.
 */
export function PaymentCTAButtons({
  onSaveDraft,
  onCollect,
  collectDisabled,
  invoice,
  printer: printerOverride,
}: PaymentCTAButtonsProps) {
  const printer = useInvoicePrinter(printerOverride);
  const [busy, setBusy] = useState(false);

  const resolveInvoice = (): InvoicePayload | null => {
    if (!invoice) return null;
    return typeof invoice === "function" ? invoice() : invoice;
  };

  const handleCollect = async () => {
    if (busy) return;
    const payload = resolveInvoice();
    if (!payload) {
      onCollect();
      return;
    }
    setBusy(true);
    try {
      await printer.print(payload);
    } catch (err) {
      // Printing must never block business flow — just surface to console.
      // eslint-disable-next-line no-console
      console.error("Lỗi in hóa đơn:", err);
    } finally {
      setBusy(false);
      onCollect();
    }
  };

  return (
    <div className="flex h-14 items-stretch gap-2 px-4 py-2">
      <button
        type="button"
        onClick={onSaveDraft}
        className="inline-flex basis-[35%] flex-col items-center justify-center rounded-lg bg-[#4F46E5] text-[13px] font-semibold leading-tight text-white transition-colors hover:bg-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <span>Lưu tạm</span>
        <KeyboardHint className="text-[11px] text-white/80">(F10)</KeyboardHint>
      </button>
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
