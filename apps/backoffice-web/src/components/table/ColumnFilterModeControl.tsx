import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
} from "@erp/ui";
import type { ColumnFilter, ColumnFilterMode } from "./pagination.dto";
import {
  COLUMN_FILTER_MODE_OPTIONS,
  DEFAULT_COLUMN_FILTER_MODE,
  describeFilterMode,
} from "./pagination.dto";

export function ColumnFilterModeDropdown({
  fieldLabel,
  value,
  onChange,
  triggerClassName,
}: {
  fieldLabel: string;
  value: ColumnFilterMode;
  onChange: (mode: ColumnFilterMode) => void;
  triggerClassName?: string;
}) {
  const current = COLUMN_FILTER_MODE_OPTIONS.find((o) => o.value === value) ?? COLUMN_FILTER_MODE_OPTIONS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 w-7 shrink-0 rounded border border-input bg-background px-1 text-center text-xs font-semibold text-foreground shadow-sm hover:bg-accent/30",
            triggerClassName,
          )}
          aria-label={`Kiểu lọc cho ${fieldLabel}`}
          title={describeFilterMode(value)}
        >
          {current.symbol}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px] p-1">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Chọn kiểu lọc</div>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as ColumnFilterMode)}>
          {COLUMN_FILTER_MODE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="inline-flex w-6 justify-center font-mono text-sm">{option.symbol}</span>
              <span className="ml-2 text-sm">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Một hàng: nút ký hiệu (*, =, …) + ô giá trị — giống bộ lọc cột bảng. */
export function ColumnFilterInlineField({
  fieldLabel,
  filter,
  onModeChange,
  onValueChange,
  placeholder = "Giá trị…",
  inputClassName,
}: {
  fieldLabel: string;
  filter: ColumnFilter;
  onModeChange: (mode: ColumnFilterMode) => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  inputClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <ColumnFilterModeDropdown
        fieldLabel={fieldLabel}
        value={filter.mode ?? DEFAULT_COLUMN_FILTER_MODE}
        onChange={onModeChange}
      />
      <Input
        className={cn("h-8 min-w-0 flex-1 text-sm font-normal", inputClassName)}
        placeholder={placeholder}
        value={filter.value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={`Giá trị lọc ${fieldLabel}`}
      />
    </div>
  );
}
