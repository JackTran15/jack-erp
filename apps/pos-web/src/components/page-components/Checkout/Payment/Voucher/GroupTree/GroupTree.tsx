import { cn } from "@erp/ui";
import { useMemo } from "react";
import type { VoucherSelectableGroup } from "@erp/pos/lib/page-libs/checkout/voucher.types";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { GroupNode } from "@erp/pos/components/page-components/Checkout/Payment/Voucher/GroupNode/GroupNode";

interface GroupTreeProps {
  groups: VoucherSelectableGroup[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (next: boolean) => void;
}

export function GroupTree({
  groups,
  selectedIds,
  onToggle,
  onToggleAll,
}: GroupTreeProps) {
  const allChecked =
    groups.length > 0 && groups.every((g) => selectedIds.has(g.id));
  const topLevel = groups.filter((g) => !g.parentId);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, VoucherSelectableGroup[]>();
    for (const g of groups) {
      if (!g.parentId) continue;
      const list = map.get(g.parentId) ?? [];
      list.push(g);
      map.set(g.parentId, list);
    }
    return map;
  }, [groups]);

  return (
    <div role="tree" aria-label="Nhóm hàng hóa">
      <div
        className={cn(
          "flex items-center gap-3 bg-[#F3F4F6] px-3 py-2 text-[14px] font-semibold text-[#1F2937]",
        )}
      >
        <PosCheckbox
          checked={allChecked}
          onChange={onToggleAll}
          ariaLabel="Chọn tất cả nhóm hàng hóa"
        />
        <span>Nhóm hàng hóa</span>
      </div>

      <div className="divide-y divide-[#E5E7EB]">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] italic text-[#9CA3AF]">
            Chưa có nhóm hàng hóa
          </p>
        ) : (
          topLevel.map((group) => (
            <GroupNode
              key={group.id}
              group={group}
              children={childrenByParent.get(group.id) ?? []}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}
