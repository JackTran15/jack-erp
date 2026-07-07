import { toast } from "sonner";

/**
 * Mở PDF tem trong một tab mới qua blob URL (giống MISA): tạo object URL từ Blob
 * `application/pdf` rồi window.open → trình xem PDF của trình duyệt. Người dùng tự in.
 */
export function printBarcodeLabels(pdf: Blob): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const url = URL.createObjectURL(pdf);
  // window.open phải chạy đồng bộ trong cùng user-gesture của click (handlePrint
  // không await gì trước khi gọi hàm này) để không bị popup blocker chặn.
  const tab = window.open(url, "_blank");

  if (!tab) {
    URL.revokeObjectURL(url);
    toast.error("Trình duyệt đã chặn cửa sổ in — hãy cho phép popup rồi in lại.");
    return Promise.resolve();
  }

  // Tab đã load xong giữ tài liệu; thu hồi URL sau 60s chỉ giải phóng bộ nhớ.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Promise.resolve();
}
