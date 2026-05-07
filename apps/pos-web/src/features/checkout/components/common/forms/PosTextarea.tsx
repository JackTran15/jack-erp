import { cn } from "@erp/ui";

export interface PosTextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function PosTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  className,
}: PosTextareaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        "block w-full resize-none border-0 border-b border-transparent bg-transparent px-0 py-2 text-[13px] text-gray-900 shadow-[inset_0_-1px_0_0_#E5E7EB] transition-[box-shadow] duration-150 ease-out placeholder:text-gray-400 focus:shadow-[inset_0_-2px_0_0_#6366F1] focus:outline-none focus:ring-0",
        className,
      )}
    />
  );
}
