/**
 * In một tài liệu HTML tự chứa qua iframe ẩn để `window.print()` mở hộp
 * thoại in mà không dính popup blocker. Port từ BrowserWindowInvoicePrinter
 * của pos-web.
 */
export function printBarcodeLabels(html: string): Promise<void> {
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
        cleanup();
        return;
      }
      // Một số browser không bắn onafterprint.
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

    // Nếu iframe đã complete trước khi gắn onload thì kích hoạt in trực tiếp.
    if (iframe.contentDocument?.readyState === "complete") {
      triggerPrint();
    }
  });
}
