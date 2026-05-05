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
        onClick={handleCollect}
        disabled={collectDisabled || busy}
        className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md bg-green-500 text-[14px] font-semibold text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40"
      >
        Thu tiền
        <KeyboardHint className="text-[12px] text-white/80">(F9)</KeyboardHint>
      </button>
    </div>
  );
}
