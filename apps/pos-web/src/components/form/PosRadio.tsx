import { cn } from "@erp/ui";

export interface PosRadioProps {
  selected: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function PosRadio({ selected, size = "sm", className }: PosRadioProps) {
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <span
      className={cn(
        "relative inline-flex h-4 w-4 items-center justify-center",
        className,
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full border transition-colors",
          selected ? "border-2 border-[#5B5BD6]" : "border border-[#D1D5DB]",
        )}
      />
      {selected ? (
        <span
          aria-hidden="true"
          className={cn("absolute rounded-full bg-[#5B5BD6]", dotSize)}
        />
      ) : null}
    </span>
  );
}
