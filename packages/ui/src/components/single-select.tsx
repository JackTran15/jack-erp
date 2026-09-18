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
  const [activeIndex, setActiveIndex] = React.useState(0);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const isComposingRef = React.useRef(false);
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

  // Opening the list highlights the current value; filtering restarts at the top.
  React.useEffect(() => {
    if (!open) return;
    const selectedIndex = visibleOptions.findIndex((o) => o.value === value);
    setActiveIndex(q === "" && selectedIndex >= 0 ? selectedIndex : 0);
    // `visibleOptions` is derived from `options`/`q`; re-running on those is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, options]);

  // Keep the highlighted option scrolled into view.
  React.useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const select = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
  };

  // Arrow keys drive the list while the caret stays in the search box.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Vietnamese IME: Enter confirms the composition, it must not pick an option.
    const composing = isComposingRef.current || e.nativeEvent.isComposing;
    const count = visibleOptions.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (count > 0) setActiveIndex((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (count > 0) setActiveIndex((i) => (i - 1 + count) % count);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      if (count > 0) setActiveIndex(count - 1);
    } else if (e.key === "Enter") {
      if (composing) return;
      const opt = visibleOptions[activeIndex];
      if (opt) {
        e.preventDefault();
        select(opt.value);
      }
    }
  };

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
      {/*
        Portal is required: without it the list is a child of whatever container
        holds the trigger, so a dialog with `contain: paint` (AppModal) or an
        `overflow-auto` body clips the options. z-index sits above the AppModal
        stack (40 + 20*depth + 10), which the list must clear since the portal
        drops it straight onto `document.body`.
      */}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-[1000] w-[--radix-popover-trigger-width] rounded-md border bg-popover p-1 shadow-md"
        >
          {searchable ? (
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
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
            {visibleOptions.map((opt, index) => {
              const selected = opt.value === value;
              const active = searchable && index === activeIndex;
              return (
                <button
                  key={opt.value}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    active ? "bg-accent" : "hover:bg-accent",
                    selected && !active && "bg-accent/50",
                    contentClassName,
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(opt.value)}
                >
                  <span className="min-w-0 truncate text-left">{opt.label}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
SingleSelect.displayName = "SingleSelect";

export { SingleSelect };
