import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { ScrollArea } from "./scroll-area";
import { Check, ChevronDown, X } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn…",
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onValueChange(value.filter((v) => v !== optionValue));
    } else {
      onValueChange([...value, optionValue]);
    }
  };

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label ?? v)
    .slice(0, 3);

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
          <span className="flex flex-wrap gap-1 truncate">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedLabels.map((l) => (
                <Badge key={l} variant="secondary" className="text-xs">
                  {l}
                </Badge>
              ))
            )}
            {value.length > 3 ? (
              <Badge variant="secondary" className="text-xs">
                +{value.length - 3}
              </Badge>
            ) : null}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Content
        align="start"
        className="z-50 w-[--radix-popover-trigger-width] rounded-md border bg-popover p-1 shadow-md"
        sideOffset={4}
      >
        <ScrollArea className="max-h-60">
          {options.map((opt) => {
            const checked = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent",
                  checked && "bg-accent/50",
                )}
                onClick={() => toggle(opt.value)}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-sm border",
                    checked
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {checked ? <Check className="h-3 w-3" /> : null}
                </div>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </ScrollArea>
        {value.length > 0 ? (
          <div className="border-t p-1">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1 rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              onClick={() => onValueChange([])}
            >
              <X className="h-3 w-3" />
              Bỏ chọn tất cả
            </button>
          </div>
        ) : null}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Root>
  );
}
MultiSelect.displayName = "MultiSelect";

export { MultiSelect };
