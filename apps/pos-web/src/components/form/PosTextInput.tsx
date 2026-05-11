import { cn } from "@erp/ui";

type PosTextAlign = "left" | "right";
type PosTextVariant = "boxed" | "underline" | "ghost";

export interface PosTextInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  align?: PosTextAlign;
  variant?: PosTextVariant;
  className?: string;
  inputClassName?: string;
}

export function PosTextInput({
  value,
  onChange,
  placeholder,
  align = "left",
  variant = "boxed",
  className,
  inputClassName,
}: PosTextInputProps) {
  const input = (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none",
        align === "right" && "text-right",
        variant === "boxed" && "h-7 px-2",
        variant === "underline" && "h-8 px-0 py-1 text-[14px]",
        variant === "ghost" && "border-0 px-0 py-2 text-[13px]",
        inputClassName,
      )}
    />
  );

  if (variant === "ghost") return input;

  return (
    <div
      className={cn(
        variant === "boxed" &&
          "flex h-7 items-center rounded border border-gray-200 bg-white transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#5C6BC0]",
        variant === "underline" &&
          "flex h-8 items-center border-b border-transparent bg-transparent shadow-[inset_0_-1px_0_0_#E5E7EB] transition-[box-shadow] duration-150 ease-out focus-within:shadow-[inset_0_-2px_0_0_#5B5BD6]",
        className,
      )}
    >
      {input}
    </div>
  );
}
