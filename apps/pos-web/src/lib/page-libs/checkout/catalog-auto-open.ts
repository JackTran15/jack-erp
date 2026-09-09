/** Input cho quyết định "có tự mở dialog chọn biến thể không". */
export interface AutoOpenVariantInput {
  /** Từ khoá đã debounce — đúng chuỗi đã gửi lên server. "" khi không lọc. */
  search: string;
  /**
   * TỔNG số card khớp bộ lọc, lấy từ `total` của response.
   *
   * Không phải `data.length`: một từ khoá khớp 21 card thì trang 2 chỉ có 1 card,
   * và đọc nhầm sang đó sẽ tự mở dialog cho một kết quả rõ ràng là "nhiều".
   */
  total: number;
  /** Card đầu trang đã về chưa. */
  hasCard: boolean;
  /**
   * Từ khoá của lần tự mở gần nhất, hoặc `null` nếu chưa mở lần nào.
   *
   * Giữ lại **kể cả sau khi người dùng đóng dialog**: điều kiện `total === 1` đúng
   * liên tục suốt thời gian từ khoá còn trên ô tìm, nên nếu không nhớ thì đóng
   * xong dialog bật lại ngay và không thoát ra được.
   */
  lastOpenedFor: string | null;
}

/**
 * Đúng một card khớp thì mở dialog chọn biến thể, không cần Enter.
 *
 * Bốn cách sai mà hàm này tồn tại để chặn, mỗi cách là một AC:
 *
 *  - đọc `data.length` thay vì `total` → mở nhầm ở trang cuối (AC-11)
 *  - không nhớ từ khoá đã mở → bật lại ngay sau khi đóng (AC-12)
 *  - mở khi 0 hoặc từ 2 card trở lên (AC-13)
 *  - mở sau một lần quét mã vạch: nhánh `added` xoá ô tìm, nên `search` rỗng và
 *    điều kiện đầu tiên đã chặn (AC-08)
 */
export function shouldAutoOpenVariant(input: AutoOpenVariantInput): boolean {
  const term = input.search.trim();
  if (!term) return false;
  if (input.total !== 1) return false;
  if (!input.hasCard) return false;
  return term !== input.lastOpenedFor;
}
