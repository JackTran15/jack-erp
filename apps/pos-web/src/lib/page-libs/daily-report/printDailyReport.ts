/**
 * Print a fully-formed HTML document via a hidden iframe (no popup blocker).
 * Mirrors the invoice printer's technique but takes raw HTML so it can render
 * the daily-report "BÁO CÁO TỔNG HỢP" document.
 */
export function printDailyReport(html: string): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.isConnected) iframe.remove();
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
  if (iframe.contentDocument?.readyState === "complete") triggerPrint();
}
