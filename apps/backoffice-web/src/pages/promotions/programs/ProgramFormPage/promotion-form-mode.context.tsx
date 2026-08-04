import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PromotionForm } from "../programs.constants";

interface PromotionFormMode {
  /** Sửa bản ghi có sẵn (khác Thêm mới) — quyết định trạng thái/hình thức có hiện không. */
  isEdit: boolean;
  /** Hình thức của CTKM đang mở; `undefined` khi chưa resolve được. */
  promotionForm?: PromotionForm;
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
  children,
}: Props) {
  const value = useMemo(
    () => ({ isEdit, promotionForm }),
    [isEdit, promotionForm],
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
