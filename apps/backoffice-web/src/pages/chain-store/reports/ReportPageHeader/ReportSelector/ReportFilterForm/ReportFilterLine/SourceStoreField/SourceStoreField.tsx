import { useBranchStore } from "../../../../../../../../store/common/branch/branch.store";

// "Cửa hàng xuất" — field read-only, set theo context (chi nhánh hiện tại), không
// cho đổi (nền xám, không chevron). Theo spec filter_transferred_goods_summary_by_store.md.
export function SourceStoreField() {
  const branchName = useBranchStore((s) => s.branchName);
  const value = branchName ?? "Cửa hàng hiện tại";

  return (
    <div
      className="flex h-9 w-full items-center rounded-[4px] border border-[#D0D0D0] bg-[#E5E6EB] px-3 text-xs text-[#777777]"
      aria-disabled="true"
    >
      <span className="truncate">{value}</span>
    </div>
  );
}
