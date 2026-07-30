import { useState } from "react";

import { PrintSettingsActions } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsActions/PrintSettingsActions";
import { PrintSettingsContentForm } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsContentForm/PrintSettingsContentForm";
import { PrintSettingsDriverNote } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsDriverNote/PrintSettingsDriverNote";
import { PrintSettingsForm } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsForm/PrintSettingsForm";
import { PrintSettingsJson } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsJson/PrintSettingsJson";
import { PrintSettingsPreview } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsPreview/PrintSettingsPreview";
import { PrintSettingsTabs } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsTabs/PrintSettingsTabs";
import { usePrintSettings } from "@erp/pos/hooks/page-hooks/print-settings/use-print-settings";
import { useSampleInvoice } from "@erp/pos/hooks/page-hooks/print-settings/use-sample-invoice";
import type { PrintSettingsTab } from "@erp/pos/types/print-settings.type";

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
  const sample = useSampleInvoice();
  const [activeTab, setActiveTab] = useState<PrintSettingsTab>("layout");

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
          <PrintSettingsTabs activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "layout" ? (
            <>
              <PrintSettingsForm settings={settings} onChange={setSetting} />
              <PrintSettingsJson settings={settings} />
            </>
          ) : (
            <PrintSettingsContentForm sample={sample} />
          )}
        </div>

        {/* Bill bật hết thành phần thì cao hơn màn hình. Sticky mà không giới
            hạn chiều cao sẽ ghim đỉnh bill lại và cắt cụt phần đuôi — phải cuộn
            hết cột trái mới thấy được. Kẹp chiều cao vào viewport rồi cho khối
            này tự cuộn: bill dài bao nhiêu cũng xem được tại chỗ. */}
        <div className="shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
          <PrintSettingsPreview
            html={previewHtml}
            pageWidth={settings.pageWidth}
          />
        </div>
      </div>
    </div>
  );
};
