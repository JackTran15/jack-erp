import { cn } from "@erp/ui";
import {
  posFormHeight,
  posFormPadX,
  posFormRadius,
} from "@erp/pos/components/common/posFormDimensions";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import type { SampleFieldMeta } from "@erp/pos/interfaces/print-sample-invoice.interface";

export interface PrintSettingsContentFieldProps {
  meta: SampleFieldMeta;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  /** Chuỗi với kind text/textarea/datetime, số với money/int. */
  value: string | number;
  onChange: (next: string | number) => void;
  /** Chỉ dùng cho field `derived`: con số đang tự tính (đã áp ghi đè). */
  derivedValue?: number;
  isOverridden?: boolean;
  /** `null` = hoàn tác về tự tính. Chỉ truyền cho field `derived`. */
  onOverride?: (next: number | null) => void;
}

/**
 * Số tiền có thể âm ("Trả lại khách" khi thu thiếu), mà parser mặc định của
 * `PosNumberInput` lọc sạch ký tự không phải chữ số nên nuốt luôn dấu trừ.
 */
function parseSignedInt(raw: string): number | null {
  const cleaned = raw.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const next = Number(cleaned);
  return Number.isFinite(next) ? next : null;
}

/**
 * Một thành phần của hóa đơn: checkbox bật/tắt + ô nhập tương ứng.
 *
 * Tắt = không đưa field vào payload, đúng quy ước ẩn dòng sẵn có của
 * `renderInvoiceHtml`. Giá trị vẫn được giữ lại nên bật lại là có ngay.
 */
export function PrintSettingsContentField({
  meta,
  enabled,
  onToggle,
  value,
  onChange,
  derivedValue,
  isOverridden,
  onOverride,
}: PrintSettingsContentFieldProps) {
  const inputId = `sample-field-${meta.key}`;
  const isNumber = meta.kind === "money" || meta.kind === "int";
  // Field tự tính chỉ mở ô nhập khi người dùng bấm ghi đè.
  const readOnlyDerived = Boolean(meta.derived) && !isOverridden;

  const control = readOnlyDerived ? (
    <div
      className={cn(
        "flex flex-1 items-center justify-end border border-dashed border-gray-300 bg-gray-50 text-sm tabular-nums text-gray-600",
        posFormHeight.md,
        posFormRadius.md,
        posFormPadX.md,
      )}
      aria-label={`${meta.label} (tự tính)`}
    >
      {new Intl.NumberFormat("vi-VN").format(derivedValue ?? 0)}
    </div>
  ) : meta.kind === "textarea" ? (
    // `PosTextarea` chỉ có variant underline — bọc khung để khớp các ô còn lại.
    <div
      className={cn(
        "flex-1 border border-gray-200 bg-white focus-within:border-[#5C6BC0]",
        posFormRadius.md,
        posFormPadX.md,
      )}
    >
      <PosTextarea
        value={String(value)}
        onChange={(next) => onChange(next)}
        rows={2}
      />
    </div>
  ) : meta.kind === "datetime" ? (
    <div
      className={cn(
        "flex flex-1 items-center border border-gray-200 bg-white focus-within:border-[#5C6BC0]",
        posFormHeight.md,
        posFormRadius.md,
        posFormPadX.md,
      )}
    >
      <input
        id={inputId}
        type="datetime-local"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 focus:outline-none"
      />
    </div>
  ) : isNumber ? (
    <PosNumberInput
      id={inputId}
      value={Number(value)}
      onChange={(next) =>
        meta.derived && onOverride ? onOverride(next) : onChange(next)
      }
      parser={parseSignedInt}
      variant="boxed"
      align="right"
      ariaLabel={meta.label}
      className="flex-1"
    />
  ) : (
    <PosTextInput
      id={inputId}
      value={String(value)}
      onChange={(next) => onChange(next)}
      variant="boxed"
      ariaLabel={meta.label}
      className="flex-1"
    />
  );

  return (
    <div className={cn("flex flex-col gap-1 py-2", !enabled && "opacity-60")}>
      <div className="flex items-center gap-2">
        {meta.required ? (
          // Chừa đúng bề ngang của checkbox để nhãn các dòng thẳng hàng nhau.
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <PosCheckbox
            checked={enabled}
            onChange={onToggle}
            ariaLabel={`In "${meta.label}"`}
          />
        )}

        <label
          htmlFor={inputId}
          className="flex-1 text-[13px] font-medium text-gray-900"
        >
          {meta.label}
        </label>

        {meta.slot ? (
          <span
            className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
            title="Renderer in được, nhưng backend chưa có nguồn dữ liệu cho field này."
          >
            BE chưa nối
          </span>
        ) : null}

        {meta.derived && onOverride ? (
          <button
            type="button"
            onClick={() =>
              onOverride(isOverridden ? null : (derivedValue ?? 0))
            }
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#5B5BD6] hover:bg-[#EEF2FF]"
          >
            {isOverridden ? "Về tự tính" : "✎ Ghi đè"}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2 pl-6">{control}</div>

      {meta.hint ? (
        <p className="pl-6 text-[11px] leading-snug text-gray-500">
          {meta.hint}
        </p>
      ) : null}
    </div>
  );
}
