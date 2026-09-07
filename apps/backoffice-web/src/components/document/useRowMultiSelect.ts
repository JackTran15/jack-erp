import { useCallback, useMemo, useState } from "react";

interface UseRowMultiSelectProps<T> {
  rows: T[];
  getRowId: (row: T) => string;
}

/**
 * Tập dòng đã tick trên một bảng danh sách chứng từ.
 *
 * Cố ý tách khỏi `useDocumentListSelection`: hook kia giữ *con trỏ dòng đang xem*
 * (nuôi panel chi tiết và các nút Xem/Sửa/Xóa), hook này giữ *tập dòng người dùng
 * đánh dấu để in tem`. Trước đây hai vai dùng chung một `selectedId`, nên mỗi cú
 * tick kéo theo một lượt fetch chi tiết và chỉ tick được một dòng.
 *
 * `allOnPageChecked` / `someOnPageChecked` tính theo `rows` — các dòng đang hiển thị —
 * chứ không theo kích thước `checkedIds`: Set còn giữ id của những trang đã lật qua,
 * nên đếm theo Set sẽ cho ô header sai trạng thái ngay khi sang trang khác.
 */
export function useRowMultiSelect<T>({
  rows,
  getRowId,
}: UseRowMultiSelectProps<T>) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());

  const pageIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);

  const isChecked = useCallback(
    (id: string) => checkedIds.has(id),
    [checkedIds],
  );

  const toggle = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setCheckedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  // `[].every()` trả true, nên phải chặn danh sách rỗng ở đây — nếu không ô header
  // của một bảng không có dòng nào sẽ hiển thị là "đã tick tất cả".
  const allOnPageChecked =
    pageIds.length > 0 && pageIds.every((id) => checkedIds.has(id));
  const someOnPageChecked =
    !allOnPageChecked && pageIds.some((id) => checkedIds.has(id));

  const toggleAllOnPage = useCallback(() => {
    if (pageIds.length === 0) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      const allChecked = pageIds.every((id) => next.has(id));
      // Chỉ động vào id của trang hiện tại; id thuộc trang khác giữ nguyên để
      // người dùng gom phiếu qua nhiều trang rồi in một lượt.
      for (const id of pageIds) {
        if (allChecked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [pageIds]);

  return {
    checkedIds,
    checkedCount: checkedIds.size,
    isChecked,
    toggle,
    toggleAllOnPage,
    clear,
    allOnPageChecked,
    someOnPageChecked,
  };
}
