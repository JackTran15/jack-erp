import { cn } from "@erp/ui";
import {
  posFormHeight,
  posFormPadX,
  posFormRadius,
} from "@erp/pos/components/common/posFormDimensions";
import type { ReceiptLayoutNumberFieldMeta } from "@erp/pos/interfaces/print-settings.interface";

export interface PrintSettingsFieldProps {
  meta: ReceiptLayoutNumberFieldMeta;
  value: number;
  onChange: (next: number) => void;
}

/**
 * Một thông số số: slider để rà nhanh + ô nhập để chốt con số chính xác.
 *
 * Dùng `<input type="number">` gốc chứ không dùng `PosNumberInput`: primitive
 * đó parse bằng `raw.replace(/\D/g, "")` và format bằng `formatVnd`, nên không
 * nhập được số âm (`offsetX`) lẫn số thập phân (`10.5px`, `1.45`) — đúng hai
 * thứ trang này cần nhất. Input gốc còn cho nhấn mũi tên lên/xuống để nhích
 * từng `step` và xem preview đổi theo, đúng kiểu thao tác khi căn máy in.
 */
export function PrintSettingsField({
  meta,
  value,
  onChange,
}: PrintSettingsFieldProps) {
  const inputId = `print-setting-${meta.key}`;

  const commit = (raw: string) => {
    if (raw.trim() === "") return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange(Math.min(meta.max, Math.max(meta.min, next)));
  };

  return (
    <div className="flex flex-col gap-1 py-2">
      <label
        htmlFor={inputId}
        className="text-[13px] font-medium text-gray-900"
      >
        {meta.label}
      </label>

      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={`${meta.label} (thanh trượt)`}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={value}
          onChange={(e) => commit(e.target.value)}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[#5B5BD6]"
        />

        <div
          className={cn(
            "inline-flex w-[104px] shrink-0 items-center gap-1 border border-gray-300 bg-white",
            posFormHeight.md,
            posFormRadius.md,
            posFormPadX.md,
            "focus-within:border-[#5B5BD6]",
          )}
        >
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={value}
            onChange={(e) => commit(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm tabular-nums text-gray-900 focus:outline-none"
          />
          {meta.unit ? (
            <span className="shrink-0 text-xs text-gray-500">{meta.unit}</span>
          ) : null}
        </div>
      </div>

      {meta.hint ? (
        <p className="text-[11px] leading-snug text-gray-500">{meta.hint}</p>
      ) : null}
    </div>
  );
}
