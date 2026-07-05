import { cn } from "@erp/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

const mmFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMm(value: number): string {
  return mmFormatter.format(value);
}

/** Parse số thập phân định dạng vi-VN ("1,05") — trả null khi không hợp lệ. */
function parseMm(text: string): number | null {
  const normalized = text.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Bước tăng/giảm của nút spinner. */
  step?: number;
  min?: number;
  className?: string;
}

/** Ô nhập kích thước mm với spinner dọc, hiển thị thập phân dấu phẩy vi-VN. */
export function PaperStepperInput({
  label,
  value,
  onChange,
  step = 0.5,
  min = 0,
  className,
}: Props) {
  const [text, setText] = useState(() => formatMm(value));

  useEffect(() => {
    setText(formatMm(value));
  }, [value]);

  const commit = () => {
    const parsed = parseMm(text);
    if (parsed == null) {
      setText(formatMm(value));
      return;
    }
    onChange(Math.max(min, parsed));
  };

  const stepBy = (direction: 1 | -1) => {
    // Tránh sai số float khi cộng dồn bước 0,05.
    const next = Math.max(min, Math.round((value + direction * step) * 100) / 100);
    onChange(next);
  };

  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[13px] leading-tight text-foreground">{label}</span>
      <span className="flex h-8 items-stretch overflow-hidden rounded border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
        <input
          className="h-full w-full min-w-0 bg-transparent px-2 text-right text-sm outline-none"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              stepBy(1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              stepBy(-1);
            }
          }}
          inputMode="decimal"
          aria-label={label}
        />
        <span className="flex w-5 shrink-0 flex-col border-l border-input">
          <button
            type="button"
            className="flex flex-1 items-center justify-center text-muted-foreground hover:bg-muted"
            onClick={() => stepBy(1)}
            tabIndex={-1}
            aria-label={`Tăng ${label}`}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center border-t border-input text-muted-foreground hover:bg-muted"
            onClick={() => stepBy(-1)}
            tabIndex={-1}
            aria-label={`Giảm ${label}`}
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </span>
      </span>
    </label>
  );
}
