import {
  posFormUnderlineShadow,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";
import { cn } from "@erp/ui";

export type PosTextareaSize = PosFormSize;

export type PosTextareaVariant = "underline";

const textareaMinRows: Record<PosTextareaSize, number> = {
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
};

const textareaBody: Record<PosTextareaSize, string> = {
  sm: "min-h-0 py-2 text-[13px]",
  md: "min-h-[5rem] py-3 text-[14px]",
  lg: "min-h-[6.5rem] py-3.5 text-[15px]",
  xl: "min-h-[8rem] py-4 text-base",
};

const textareaVariant: Record<
  PosTextareaVariant,
  (size: PosTextareaSize, invalid?: boolean) => string
> = {
  underline: (size, invalid) =>
    cn(
      "block w-full resize-none border-0 border-b border-transparent bg-transparent text-gray-900 transition-[box-shadow] duration-150 ease-out placeholder:text-gray-400 focus:outline-none focus:ring-0",
      posFormUnderlineShadow(invalid),
      textareaBody[size],
    ),
};

export interface PosTextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  size?: PosTextareaSize;
  variant?: PosTextareaVariant;
  invalid?: boolean;
  className?: string;
}

export function PosTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  size = "md",
  variant = "underline",
  invalid,
  className,
}: PosTextareaProps) {
  const effectiveRows = Math.max(rows, textareaMinRows[size]);

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={effectiveRows}
      aria-invalid={invalid || undefined}
      className={cn(textareaVariant[variant](size, invalid), className)}
    />
  );
}
