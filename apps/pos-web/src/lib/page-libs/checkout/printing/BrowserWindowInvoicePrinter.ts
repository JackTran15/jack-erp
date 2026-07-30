import type { InvoicePrinter } from "./InvoicePrinter";
import { renderInvoiceHtml } from "./renderInvoiceHtml";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import type { ReceiptLayoutSettings } from "@erp/pos/interfaces/print-settings.interface";
import { getReceiptLayoutSettings } from "@erp/pos/stores/common/print-settings.store";

/** Hết thời gian chờ ảnh — thà in thiếu logo còn hơn treo luôn hộp thoại in. */
const IMAGE_WAIT_TIMEOUT_MS = 3_000;

/**
 * Chờ mọi ảnh trong bill tải xong. `document.write` xong là `readyState` đã
 * "complete" NHƯNG ảnh vẫn đang tải (đã đo bằng Chrome), nên nếu print() ngay
 * thì logo không ra giấy. Resolve cả khi ảnh lỗi/quá hạn để không chặn việc in.
 */
function whenImagesSettled(doc: Document): Promise<void> {
  const pending = Array.from(doc.images).filter((img) => !img.complete);
  if (pending.length === 0) return Promise.resolve();

  const loaded = Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, IMAGE_WAIT_TIMEOUT_MS),
  );

  return Promise.race([loaded.then(() => undefined), timeout]);
}

/**
 * Default printer: builds the receipt HTML and pipes it through a hidden
 * iframe so `window.print()` opens the browser print dialog without a popup
 * blocker. Keep this thin — anything device-specific belongs in a sibling
 * implementation (e.g. ThermalEscPosInvoicePrinter, PdfServiceInvoicePrinter).
 */
export class BrowserWindowInvoicePrinter implements InvoicePrinter {
  /**
   * @param resolveLayout Nguồn thông số khổ giấy/cỡ chữ. Nhận HÀM chứ không
   * nhận object để giá trị được đọc tại thời điểm in — người dùng chỉnh ở tab
   * `/cai-dat-in` là lần in kế tiếp ăn ngay, không phải tạo lại printer.
   * Trang cài đặt truyền resolver riêng để in thử bộ số đang chỉnh dở.
   */
  constructor(
    private readonly resolveLayout: () => ReceiptLayoutSettings = getReceiptLayoutSettings,
  ) {}

  print(invoice: InvoicePayload): Promise<void> {
    return new Promise((resolve) => {
      if (typeof document === "undefined" || typeof window === "undefined") {
        resolve();
        return;
      }

      const html = renderInvoiceHtml(invoice, this.resolveLayout());
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

      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) {
        cleanup();
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();

      // `close()` đã dựng xong DOM nên `doc.images` đủ mặt; chỉ còn chờ ảnh tải.
      // KHÔNG bám vào `iframe.onload` hay `readyState`: cả hai đều báo xong
      // trước khi ảnh load, và bám cả hai thì hộp thoại in bật lên hai lần.
      void whenImagesSettled(doc).then(triggerPrint);
    });
  }
}
