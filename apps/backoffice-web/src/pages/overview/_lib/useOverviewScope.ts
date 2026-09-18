import {
  useBranchStore,
  useIsChainSelected,
} from "../../../store/common/branch/branch.store";

export interface OverviewScope {
  /** Khoá phạm vi dữ liệu, dùng trong queryKey và làm hạt giống cho mock. */
  key: string;
  /** Tên hiển thị trong header row 1: "(Kho tổng)" hoặc tên chi nhánh. */
  label: string;
}

/** Phạm vi dữ liệu hiện tại: chuỗi cửa hàng hay một chi nhánh cụ thể. */
export function useOverviewScope(): OverviewScope {
  const isChain = useIsChainSelected();
  const branchId = useBranchStore((s) => s.branchId);
  const branchName = useBranchStore((s) => s.branchName);

  if (isChain) return { key: "chain", label: "Kho tổng" };
  return { key: branchId ?? "unknown", label: branchName ?? "Kho tổng" };
}
