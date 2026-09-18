interface Props {
  /** Phân biệt các nhóm radio cùng tồn tại trên một modal. */
  name: string;
  ariaLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

/**
 * Radio ngang trong modal "Tùy chọn". Dùng `<input type="radio">` với
 * `accent-primary` — đúng pattern sẵn có ở `StoreScopeField` (@erp/ui không
 * export RadioGroup).
 */
export function OptionsRadioGroup({
  name,
  ariaLabel,
  value,
  options,
  onChange,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-4"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 text-sm text-[#212121]"
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="h-4 w-4 accent-primary"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
