import type { InvoicePrinter } from "./InvoicePrinter";
import { renderInvoiceHtml } from "./renderInvoiceHtml";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";

/**
 * Default printer: builds the receipt HTML and pipes it through a hidden
 * iframe so `window.print()` opens the browser print dialog without a popup
 * blocker. Keep this thin — anything device-specific belongs in a sibling
 * implementation (e.g. ThermalEscPosInvoicePrinter, PdfServiceInvoicePrinter).
 */
export class BrowserWindowInvoicePrinter implements InvoicePrinter {
  print(invoice: InvoicePayload): Promise<void> {
    return new Promise((resolve) => {
      if (typeof document === "undefined" || typeof window === "undefined") {
        resolve();
        return;
      }

      const html = renderInvoiceHtml(invoice);
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const cleanup = () => {
        if (iframe.isConnected) iframe.remove();
        resolve();
      };

      const triggerPrint = () => {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.onafterprint = cleanup;
        try {
          win.focus();
          win.print();
        } catch {
          // Fallback if print() is blocked — just clean up.
          cleanup();
          return;
        }
        // Safety fallback: some browsers do not fire onafterprint.
        setTimeout(cleanup, 60_000);
      };

      iframe.onload = triggerPrint;

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) {
        cleanup();
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();

      // If the iframe finished writing synchronously and onload already
      // fired before we attached the handler, kick off print directly.
      if (iframe.contentDocument?.readyState === "complete") {
        triggerPrint();
      }
    });
  }
}
