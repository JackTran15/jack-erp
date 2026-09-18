import { SummaryStatChip } from "./SummaryStatChip/SummaryStatChip";

export interface StatChipItem {
  key: string;
  label: string;
  color: string;
  /** Bỏ trống ở mọi chip → nhóm chip chỉ làm legend, không hiện số. */
  value?: number;
}

interface Props {
  items: StatChipItem[];
  /** Key của các series đang bị ẩn khỏi chart. */
  hiddenKeys: string[];
  onToggle: (key: string) => void;
}

/** Hàng chip legend/KPI phía trên chart của row 2 và row 3. */
export function SummaryStatChipGroup({ items, hiddenKeys, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <SummaryStatChip
          key={item.key}
          label={item.label}
          color={item.color}
          value={item.value}
          hidden={hiddenKeys.includes(item.key)}
          onToggle={() => onToggle(item.key)}
        />
      ))}
    </div>
  );
}
