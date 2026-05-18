import type { PosFormSize } from "@erp/pos/components/common/posFormDimensions";
import { cn } from "@erp/ui";

export type PosRadioSize = PosFormSize;

const radioSize: Record<PosRadioSize, { outer: string; dot: string }> = {
  sm: { outer: "h-4 w-4", dot: "h-1.5 w-1.5" },
  md: { outer: "h-5 w-5", dot: "h-2 w-2" },
  lg: { outer: "h-6 w-6", dot: "h-2.5 w-2.5" },
  xl: { outer: "h-7 w-7", dot: "h-3 w-3" },
};

export interface PosRadioProps {
  selected: boolean;
  size?: PosRadioSize;
  className?: string;
}

export function PosRadio({ selected, size = "sm", className }: PosRadioProps) {
  const s = radioSize[size];

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center",
        s.outer,
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full border transition-colors",
          s.outer,
          selected ? "border-2 border-[#5B5BD6]" : "border border-[#D1D5DB]",
        )}
      />
      {selected ? (
        <span
          aria-hidden="true"
          className={cn("absolute rounded-full bg-[#5B5BD6]", s.dot)}
        />
      ) : null}
    </span>
  );
}
