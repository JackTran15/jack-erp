import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";

/**
 * Strategy interface for printing a receipt. Swap implementations to retarget
 * different output devices (browser dialog, thermal printer, PDF, remote
 * printing service…) without touching the calling component.
 *
 * Implementations may print synchronously (returning void) or asynchronously
 * (returning a Promise). Callers should `await` the result so any side effects
 * after printing (e.g. resetting cart) happen in the right order.
 */
export interface InvoicePrinter {
  print(invoice: InvoicePayload): Promise<void> | void;
}
