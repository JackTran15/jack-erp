/**
 * Prints a self-contained HTML document via a hidden iframe so
 * `window.print()` opens the browser print dialog without triggering a popup
 * blocker (the reason pos-web's `BrowserWindowInvoicePrinter` uses an iframe
 * instead of `window.open`). Ported from
 * `apps/pos-web/src/lib/page-libs/checkout/printing/BrowserWindowInvoicePrinter.ts`,
 * generalized to take raw HTML instead of an invoice payload.
 */
export function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      resolve();
      return;
    }

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

    // If the iframe finished writing synchronously and onload already fired
    // before we attached the handler, kick off print directly.
    if (iframe.contentDocument?.readyState === "complete") {
      triggerPrint();
    }
  });
}
