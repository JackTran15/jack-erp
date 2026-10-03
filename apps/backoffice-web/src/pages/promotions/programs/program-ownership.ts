/**
 * CTKM theo chi nhánh (2026100301): ai được sửa chương trình nào, và phạm vi cửa
 * hàng có bị khoá không. Bản phía client của `PromotionAccess` ở API — API vẫn là
 * nơi quyết định; đây chỉ để không mời người dùng bấm vào một nút sẽ ăn 403.
 */

/** Quyền quản lý CTKM toàn chuỗi (công ty). Không có nó = chỉ quản lý CTKM của chi nhánh đang chọn. */
export const PROMOTION_CHAIN_MANAGE = "promotion.chain.manage";

/** Nhãn cột "Đơn vị quản lý" cho chương trình của công ty. */
export const CHAIN_OWNER_LABEL = "Toàn chuỗi";

export interface ProgramOwnership {
  ownerBranchId: string | null;
  ownerBranchName: string | null;
}

/** Phạm vi cửa hàng bị khoá vào đúng chi nhánh sở hữu (ADR-04). */
export interface BranchLock {
  branchId: string;
  /** `null` khi chưa biết tên (vd. tạo mới) — UI tự tra theo danh sách chi nhánh. */
  branchName: string | null;
}

export function canManageProgram(
  program: Pick<ProgramOwnership, "ownerBranchId">,
  activeBranchId: string | null,
  isChainManager: boolean,
): boolean {
  if (isChainManager) return true;
  return activeBranchId !== null && program.ownerBranchId === activeBranchId;
}

/**
 * - Sửa CTKM của chi nhánh: khoá vào chi nhánh sở hữu, kể cả với công ty.
 * - Sửa CTKM của công ty: không khoá.
 * - Thêm mới / Nhân bản: công ty tạo CTKM toàn chuỗi (không khoá); quản lý chi
 *   nhánh tạo CTKM của chi nhánh đang chọn (A-03).
 */
export function branchLockFor(params: {
  editing: ProgramOwnership | undefined;
  activeBranchId: string | null;
  isChainManager: boolean;
}): BranchLock | undefined {
  const { editing, activeBranchId, isChainManager } = params;
  if (editing) {
    return editing.ownerBranchId
      ? { branchId: editing.ownerBranchId, branchName: editing.ownerBranchName }
      : undefined;
  }
  if (isChainManager || !activeBranchId) return undefined;
  return { branchId: activeBranchId, branchName: null };
}

/** Sửa/Xóa trên danh sách chỉ bật khi mọi dòng đang chọn đều quản lý được (AC-09). */
export function allManageable(
  programs: Pick<ProgramOwnership, "ownerBranchId">[],
  activeBranchId: string | null,
  isChainManager: boolean,
): boolean {
  return programs.every((program) => canManageProgram(program, activeBranchId, isChainManager));
}

export function ownerLabel(program: ProgramOwnership): string {
  if (!program.ownerBranchId) return CHAIN_OWNER_LABEL;
  return program.ownerBranchName ?? program.ownerBranchId;
}
