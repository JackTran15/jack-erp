import { PrintSettingsActions } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsActions/PrintSettingsActions";
import { PrintSettingsDriverNote } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsDriverNote/PrintSettingsDriverNote";
import { PrintSettingsForm } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsForm/PrintSettingsForm";
import { PrintSettingsJson } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsJson/PrintSettingsJson";
import { PrintSettingsPreview } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsPreview/PrintSettingsPreview";
import { usePrintSettings } from "@erp/pos/hooks/page-hooks/print-settings/use-print-settings";

/**
 * Trang căn chỉnh thông số in hóa đơn. Mở ở tab riêng từ menu "Máy in - Mẫu in"
 * nên không có shell POS — vào thẳng công cụ, giỏ hàng ở tab bán hàng giữ nguyên.
 *
 * Thông số lưu theo máy (localStorage) và có hiệu lực ngay cho tab bán hàng đang
 * mở, không cần reload.
 */
export const PrintSettingsPage = () => {
  const {
    settings,
    setSetting,
    resetSettings,
    previewHtml,
    isPrinting,
    printTest,
    copyAsDefaults,
    isDirty,
  } = usePrintSettings();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-3">
        <h1 className="text-base font-bold text-gray-900">
          Máy in - Mẫu in
        </h1>
        <p className="text-[12px] text-gray-500">
          Căn chỉnh thông số bản in hóa đơn. Cấu hình lưu riêng trên máy này.
        </p>
      </header>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <PrintSettingsDriverNote />
          <PrintSettingsActions
            isPrinting={isPrinting}
            isDirty={isDirty}
            onPrintTest={() => void printTest()}
            onReset={resetSettings}
            onCopyDefaults={() => void copyAsDefaults()}
          />
          <PrintSettingsForm settings={settings} onChange={setSetting} />
          <PrintSettingsJson settings={settings} />
        </div>

        <div className="shrink-0 lg:sticky lg:top-6">
          <PrintSettingsPreview
            html={previewHtml}
            pageWidth={settings.pageWidth}
          />
        </div>
      </div>
    </div>
  );
};
