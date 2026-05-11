import { cn } from "@erp/ui";
import {
  ChevronDownIcon,
  MapPinIcon,
} from "@erp/pos/components/icons/Icon";

export interface LocationIndicatorProps {
  location: string;
  onClick?: () => void;
}

/** Compact location switcher — pin icon + name + chevron. */
export function LocationIndicator({
  location,
  onClick,
}: LocationIndicatorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-[13px] text-gray-700 transition-colors",
        "hover:border-gray-200 hover:bg-gray-50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
      )}
    >
      <MapPinIcon size={14} className="text-gray-500" />
      <span className="flex-1 whitespace-nowrap text-left">{location}</span>
      <ChevronDownIcon size={14} className="text-gray-400" />
    </button>
  );
}
