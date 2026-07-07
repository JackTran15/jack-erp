import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../lib/utils";
import { ScrollArea } from "./scroll-area";
import { ChevronDown, X } from "lucide-react";
import type { MultiSelectOption } from "./multi-select";

export interface MultiSelectChipsProps {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Extra classes for the dropdown option rows (e.g. "text-xs" for dense filters). */
  contentClassName?: string;
  disabled?: boolean;
}

function MultiSelectChips({
  options,
  value,
  onValueChange,
  placeholder = "Chọn…",
  className,
  contentClassName,
  disabled,
}: MultiSelectChipsProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const isComposingRef = React.useRef(false);

  const remove = (optionValue: string) => {
    onValueChange(value.filter((v) => v !== optionValue));
  };

  const add = (optionValue: string) => {
    onValueChange([...value, optionValue]);
    setSearch("");
    inputRef.current?.focus();
  };

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;

  const q = search.trim().toLowerCase();
  const availableOptions = options.filter(
    (o) => !value.includes(o.value) && (q === "" || o.label.toLowerCase().includes(q)),
  );

  // Reset highlight to the top whenever the visible list changes (open/search).
  React.useEffect(() => {
    setActiveIndex(0);
  }, [open, search]);

  // Keep the highlighted option scrolled into view.
  React.useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const composing = isComposingRef.current || e.nativeEvent.isComposing;
    const count = availableOptions.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (count > 0) setActiveIndex((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (count > 0) setActiveIndex((i) => (i - 1 + count) % count);
    } else if (e.key === "Enter") {
      if (composing) return;
      const opt = availableOptions[activeIndex];
      if (open && opt) {
        e.preventDefault();
        add(opt.value);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    } else if (
      e.key === "Backspace" &&
      search === "" &&
      value.length > 0 &&
      !composing
    ) {
      remove(value[value.length - 1]!);
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div
          ref={containerRef}
          className={cn(
            "flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
          onClick={() => {
            if (!disabled) inputRef.current?.focus();
          }}
        >
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-transparent bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-semibold text-secondary-foreground"
            >
              {labelOf(v)}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Bỏ chọn ${labelOf(v)}`}
                className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-secondary-foreground/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  remove(v);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className="min-w-[60px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            value={search}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : ""}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Mở danh sách"
            className="ml-auto shrink-0 disabled:pointer-events-none"
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              setOpen((o) => !o);
              inputRef.current?.focus();
            }}
          >
            <ChevronDown className="h-4 w-4 opacity-50" />
          </button>
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Content
        align="start"
        className="z-50 w-[--radix-popover-trigger-width] rounded-md border bg-popover p-1 shadow-md"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (containerRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <ScrollArea className="max-h-60">
          {availableOptions.length === 0 ? (
            <div
              className={cn(
                "px-2 py-1.5 text-sm text-muted-foreground",
                contentClassName,
              )}
            >
              {q !== "" ? "Không tìm thấy" : "Đã chọn tất cả"}
            </div>
          ) : (
            availableOptions.map((opt, index) => (
              <button
                key={opt.value}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                  index === activeIndex ? "bg-accent" : "hover:bg-accent",
                  contentClassName,
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => add(opt.value)}
              >
                <span className="min-w-0 truncate text-left">{opt.label}</span>
              </button>
            ))
          )}
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
MultiSelectChips.displayName = "MultiSelectChips";

export { MultiSelectChips };
