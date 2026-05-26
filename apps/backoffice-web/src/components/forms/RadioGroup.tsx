import { cn } from "@erp/ui";

export interface RadioGroupOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  name: string;
  value: T;
  options: readonly RadioGroupOption<T>[];
  onChange?: (value: T) => void;
  /** Chỉ hiển thị — không gọi onChange, radio bị vô hiệu và dùng màu muted. */
  readOnly?: boolean;
  className?: string;
}

export function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  readOnly = false,
  className,
}: RadioGroupProps<T>) {
  return (
    <div
      className={cn("flex flex-wrap gap-4 pt-2 text-sm", className)}
      aria-readonly={readOnly || undefined}
    >
      {options.map((opt) => {
        const isDisabled = readOnly || opt.disabled;

        return (
          <label
            key={opt.value}
            className={cn(
              "flex items-center gap-2",
              isDisabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={value === opt.value}
              disabled={isDisabled}
              onChange={
                isDisabled || !onChange ? undefined : () => onChange(opt.value)
              }
              className={cn(
                "shrink-0 accent-primary",
                "disabled:cursor-not-allowed",
              )}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
