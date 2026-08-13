export interface PosHandoffParams {
  /** Mã bàn giao dùng một lần từ ERP, null nếu mở POS theo cách thường. */
  code: string | null;
  /** Chi nhánh ERP muốn POS mở lên; chỉ đọc kèm khi có `code`. */
  branchId: string | null;
}

/**
 * Đọc và xoá `?handoff=` khỏi URL ngay lúc import — tức là TRƯỚC khi
 * `BrowserRouter` chụp location đầu tiên.
 *
 * Không dọn được sau đó: react-router giữ location riêng của nó, nên mọi điều
 * hướng về sau (redirect của `PosRequireBranch`, `PosRequireAuth`...) ghi lại
 * thanh địa chỉ theo bản location cũ và mã đã dùng lại hiện ra. `replaceState`
 * thủ công hay `setSearchParams` đều thua ván này.
 *
 * `branchId` chỉ bị xoá khi đi kèm `code` — link chỉ có `?branchId=` (khi ERP
 * không cấp được mã) vẫn để dành cho `PosBranchHandoff` xử lý như trước.
 */
function readAndStripHandoffParams(): PosHandoffParams {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("handoff");
  if (!code) {
    return { code: null, branchId: null };
  }

  const branchId = url.searchParams.get("branchId");
  url.searchParams.delete("handoff");
  url.searchParams.delete("branchId");
  window.history.replaceState(window.history.state, "", url.toString());

  return { code, branchId };
}

export const posHandoffParams: PosHandoffParams = readAndStripHandoffParams();
