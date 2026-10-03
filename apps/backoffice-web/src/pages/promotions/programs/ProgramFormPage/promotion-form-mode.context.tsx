import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PromotionForm } from "../programs.constants";
import type { BranchLock } from "../program-ownership";

interface PromotionFormMode {
  /** Sửa bản ghi có sẵn (khác Thêm mới) — quyết định trạng thái/hình thức có hiện không. */
  isEdit: boolean;
  /** Hình thức của CTKM đang mở; `undefined` khi chưa resolve được. */
  promotionForm?: PromotionForm;
  /** CTKM của chi nhánh: "Cửa hàng áp dụng" khoá vào chi nhánh sở hữu (ADR-04). */
  branchLock?: BranchLock;
  /** Không quản lý được CTKM này: mọi ô bị khoá, chỉ xem (AC-09). */
  readOnly?: boolean;
}

/**
 * Chế độ của form, đọc bởi các section dùng chung.
 *
 * Cùng lý do với `PromotionIssuesContext`: 5 variant × ~11 section dùng chung,
 * truyền hai prop này qua từng lớp sẽ chạm vào mọi component chỉ để chuyển tiếp.
 */
const PromotionFormModeContext = createContext<PromotionFormMode>({
  isEdit: false,
});

interface Props extends PromotionFormMode {
  children: ReactNode;
}

export function PromotionFormModeProvider({
  isEdit,
  promotionForm,
  branchLock,
  readOnly,
  children,
}: Props) {
  const value = useMemo(
    () => ({ isEdit, promotionForm, branchLock, readOnly }),
    [isEdit, promotionForm, branchLock, readOnly],
  );
  return (
    <PromotionFormModeContext.Provider value={value}>
      {children}
    </PromotionFormModeContext.Provider>
  );
}

export function usePromotionFormMode(): PromotionFormMode {
  return useContext(PromotionFormModeContext);
}
