import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Check, ChevronDown } from "lucide-react";

export interface SingleSelectOption {
  value: string;
  label: string;
}

export interface SingleSelectProps {
  options: SingleSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Extra classes for the dropdown option rows (e.g. "text-xs" for dense filters). */
  contentClassName?: string;
  disabled?: boolean;
  /** Show a filter box above the options and match them against `label`. */
  searchable?: boolean;
  /** Placeholder of the filter box; only used when `searchable`. */
  searchPlaceholder?: string;
}

function SingleSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn…",
  className,
  contentClassName,
  disabled,
  searchable,
  searchPlaceholder = "Tìm kiếm…",
}: SingleSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  // Start every visit to the list from an unfiltered view.
  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const q = search.trim().toLowerCase();
  const visibleOptions =
    searchable && q !== ""
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="start"
        sideOffset={4}
        className="z-50 w-[--radix-popover-trigger-width] rounded-md border bg-popover p-1 shadow-md"
      >
        {searchable ? (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              "mb-1 w-full rounded-sm border-b border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground",
              contentClassName,
            )}
          />
        ) : null}
        <div className="max-h-60 overflow-y-auto">
          {searchable && visibleOptions.length === 0 ? (
            <p
              className={cn(
                "px-2 py-1.5 text-sm text-muted-foreground",
                contentClassName,
              )}
            >
              Không tìm thấy kết quả
            </p>
          ) : null}
          {visibleOptions.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent",
                  selected && "bg-accent/50",
                  contentClassName,
                )}
                onClick={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 truncate text-left">{opt.label}</span>
                {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
SingleSelect.displayName = "SingleSelect";

export { SingleSelect };
