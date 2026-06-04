import * as React from "react";
import { cn } from "../lib/utils";
import { Badge } from "./badge";
import { Input } from "./input";
import { X } from "lucide-react";

export interface TagsInputProps {
  value: string[];
  onValueChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function TagsInput({
  value,
  onValueChange,
  placeholder = "Thêm nhãn…",
  className,
  disabled,
}: TagsInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isComposingRef = React.useRef(false);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onValueChange([...value, trimmed]);
    setInputValue("");
  };

  const removeTag = (tag: string) => {
    onValueChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (
        isComposingRef.current ||
        e.nativeEvent.isComposing ||
        e.keyCode === 229
      ) {
        return;
      }
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      removeTag(value[value.length - 1]!);
    }
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="min-w-0 max-w-full gap-1">
          <span className="min-w-0 truncate">{tag}</span>
          {!disabled ? (
            <button
              type="button"
              className="ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              aria-label={`Xóa ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </Badge>
      ))}
      <input
        ref={inputRef}
        type="text"
        className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        placeholder={value.length === 0 ? placeholder : ""}
        disabled={disabled}
      />
    </div>
  );
}
TagsInput.displayName = "TagsInput";

export { TagsInput };
