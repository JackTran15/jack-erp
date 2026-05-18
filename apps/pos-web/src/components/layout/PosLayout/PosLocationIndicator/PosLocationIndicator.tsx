import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { MapPinIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

interface BranchOption {
  id: string;
  name: string;
}

/**
 * Branch indicator in the POS topbar. Reads the active branch from the branch
 * store and renders it as a single-option {@link PosSelect}. Branch switching
 * lives on the dedicated `/chon-chi-nhanh` page.
 */
export function PosLocationIndicator() {
  const branchId = usePosBranchStore((s) => s.branchId);
  const branchName = usePosBranchStore((s) => s.branchName);
  const current: BranchOption | null =
    branchId && branchName ? { id: branchId, name: branchName } : null;

  return (
    <PosSelect<BranchOption>
      items={current ? [current] : []}
      value={current}
      onChange={() => {}}
      itemKey={(b) => b.id}
      renderItem={(b) => b.name}
      ariaLabel="Chi nhánh"
      placeholder="Chọn chi nhánh"
      emptyText="Không có chi nhánh"
      prefix={<MapPinIcon size={14} className="text-gray-500" />}
      className="min-w-[180px]"
    />
  );
}
