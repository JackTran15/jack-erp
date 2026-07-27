import type { ReceiptLayoutSettings } from "@erp/pos/interfaces/print-settings.interface";

export interface PrintSettingsJsonProps {
  settings: ReceiptLayoutSettings;
}

/**
 * Bộ số hiện tại dạng JSON — dán đè lên `RECEIPT_LAYOUT_DEFAULTS` trong
 * `constants/print-settings.constant.ts` để biến kết quả căn máy in thành mặc
 * định cho mọi máy. Cũng là đường copy dự phòng khi trình duyệt chặn clipboard.
 */
export function PrintSettingsJson({ settings }: PrintSettingsJsonProps) {
  return (
    <details className="rounded-md border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-gray-900">
        JSON để cập nhật mặc định trong code
      </summary>
      <pre className="overflow-x-auto border-t border-gray-200 px-3 py-2 text-[11px] leading-snug text-gray-700">
        {JSON.stringify(settings, null, 2)}
      </pre>
    </details>
  );
}
