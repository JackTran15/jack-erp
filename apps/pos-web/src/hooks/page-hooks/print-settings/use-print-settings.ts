import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { RECEIPT_LAYOUT_DEFAULTS } from "@erp/pos/constants/print-settings.constant";
import type { ReceiptLayoutSettings } from "@erp/pos/interfaces/print-settings.interface";
import { BrowserWindowInvoicePrinter } from "@erp/pos/lib/page-libs/checkout/printing/BrowserWindowInvoicePrinter";
import { renderInvoiceHtml } from "@erp/pos/lib/page-libs/checkout/printing/renderInvoiceHtml";
import { buildPayloadFromDraft } from "@erp/pos/lib/page-libs/print-settings/sampleInvoiceDraft";
import { usePosPrintSampleInvoiceStore } from "@erp/pos/stores/common/print-sample-invoice.store";
import { usePosPrintSettingsStore } from "@erp/pos/stores/common/print-settings.store";

export interface UsePrintSettingsResult {
  settings: ReceiptLayoutSettings;
  setSetting: <K extends keyof ReceiptLayoutSettings>(
    key: K,
    value: ReceiptLayoutSettings[K],
  ) => void;
  resetSettings: () => void;
  /** HTML preview — render bằng ĐÚNG renderer dùng khi in thật. */
  previewHtml: string;
  isPrinting: boolean;
  printTest: () => Promise<void>;
  copyAsDefaults: () => Promise<void>;
  /** True khi bộ số hiện tại khác mặc định trong code. */
  isDirty: boolean;
}

/**
 * State + hành động của trang cài đặt máy in. Preview luôn dùng
 * `renderInvoiceHtml` — không dựng lại bằng React — nếu không preview sẽ trôi
 * lệch khỏi bản in thật và làm hỏng cả vòng lặp tinh chỉnh.
 */
export const usePrintSettings = (): UsePrintSettingsResult => {
  const settings = usePosPrintSettingsStore((s) => s.settings);
  const setSetting = usePosPrintSettingsStore((s) => s.setSetting);
  const resetSettings = usePosPrintSettingsStore((s) => s.resetSettings);
  // Nội dung hóa đơn mẫu do người dùng chỉnh ở tab "Nội dung hóa đơn".
  const draft = usePosPrintSampleInvoiceStore((s) => s.draft);
  const [isPrinting, setIsPrinting] = useState(false);

  // Preview luôn 1 liên: nhiều liên chỉ lặp lại đúng nội dung đó, xem 1 là đủ.
  const previewHtml = useMemo(
    () => renderInvoiceHtml(buildPayloadFromDraft(draft, 1), settings),
    [draft, settings],
  );

  const isDirty = useMemo(
    () =>
      (
        Object.keys(RECEIPT_LAYOUT_DEFAULTS) as Array<
          keyof ReceiptLayoutSettings
        >
      ).some((key) => settings[key] !== RECEIPT_LAYOUT_DEFAULTS[key]),
    [settings],
  );

  const printTest = useCallback(async () => {
    setIsPrinting(true);
    try {
      // Resolver đóng gói `settings` hiện tại thay vì đọc store: in đúng bộ số
      // đang hiển thị, kể cả khi state chưa kịp ghi xuống localStorage.
      const printer = new BrowserWindowInvoicePrinter(() => settings);
      await printer.print(buildPayloadFromDraft(draft, settings.testCopies));
    } catch (err) {
      console.error("Lỗi in thử:", err);
      toast.error("Không mở được hộp thoại in.");
    } finally {
      setIsPrinting(false);
    }
  }, [draft, settings]);

  const copyAsDefaults = useCallback(async () => {
    const snippet = JSON.stringify(settings, null, 2);
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Đã copy. Dán đè lên RECEIPT_LAYOUT_DEFAULTS trong code.");
    } catch {
      toast.error("Trình duyệt chặn clipboard — copy thủ công từ ô JSON bên dưới.");
    }
  }, [settings]);

  return {
    settings,
    setSetting,
    resetSettings,
    previewHtml,
    isPrinting,
    printTest,
    copyAsDefaults,
    isDirty,
  };
};
