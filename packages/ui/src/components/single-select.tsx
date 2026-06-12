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
  disabled?: boolean;
}

function SingleSelect({
  options,
  value,
  onValueChange,
  placeholder = "Chọn…",
  className,
  disabled,
}: SingleSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

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
        <div className="max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent",
                  selected && "bg-accent/50",
                )}
                onClick={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
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
