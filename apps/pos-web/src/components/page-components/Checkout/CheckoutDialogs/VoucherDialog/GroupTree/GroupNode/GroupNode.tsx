import type { VoucherSelectableGroup } from "@erp/pos/interfaces/voucher.interface";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";

interface GroupNodeProps {
  group: VoucherSelectableGroup;
  children: VoucherSelectableGroup[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

export function GroupNode({
  group,
  children,
  selectedIds,
  onToggle,
}: GroupNodeProps) {
  return (
    <>
      <div
        role="treeitem"
        className="flex items-center gap-3 px-3 py-2 text-[14px] text-[#1F2937] hover:bg-[#F9FAFB]"
      >
        <PosCheckbox
          checked={selectedIds.has(group.id)}
          onChange={() => onToggle(group.id)}
          ariaLabel={group.name}
        />
        <span>{group.name}</span>
      </div>
      {children.map((child) => (
        <div
          key={child.id}
          role="treeitem"
          className="flex items-center gap-3 py-2 pl-9 pr-3 text-[14px] text-[#1F2937] hover:bg-[#F9FAFB]"
        >
          <PosCheckbox
            checked={selectedIds.has(child.id)}
            onChange={() => onToggle(child.id)}
            ariaLabel={child.name}
          />
          <span>{child.name}</span>
        </div>
      ))}
    </>
  );
}
