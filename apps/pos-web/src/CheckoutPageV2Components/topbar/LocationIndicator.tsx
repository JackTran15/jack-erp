import { MapPinIcon } from "../icons/Icon";
import { DropdownButton } from "../common/DropdownButton";

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
    <DropdownButton
      size="sm"
      onClick={onClick}
      leading={<MapPinIcon size={14} className="text-gray-500" />}
      className="border-transparent bg-transparent hover:border-gray-200"
    >
      {location}
    </DropdownButton>
  );
}
