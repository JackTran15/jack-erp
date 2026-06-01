import type { Hotkey } from "@tanstack/react-hotkeys";

/**
 * Single source of truth cho toàn bộ phím tắt POS.
 *
 * Mỗi entry là một `PosHotkeyDef` gồm `key` (đúng kiểu `Hotkey` của TanStack —
 * type-safe, ví dụ "F3", "Mod+S", "Alt+Shift+P") và `description` (tiếng Việt,
 * hiển thị trong help-overlay / devtools).
 *
 * Khi thêm phím tắt mới:
 *   1. Thêm entry vào namespace tương ứng dưới đây (tạo namespace mới nếu cần).
 *   2. Trong component/hook gọi `usePosHotkey(POS_HOTKEYS.<ns>.<action>, cb)`.
 *   3. Cập nhật bảng phím trong `README.md` cùng thư mục.
 *   4. Kiểm tra không xung đột — không có 2 entry cùng `key` mà cùng phạm vi.
 */
export const POS_HOTKEYS = {
  /** Phím tắt trong trang Checkout (CheckoutPageV2). */
  checkout: {
    focusProductSearch: {
      key: "F3",
      description: "Tìm hàng hóa",
    },
    focusCustomerSearch: {
      key: "F4",
      description: "Tìm khách hàng",
    },
    focusCatalogSearch: {
      key: "Shift+F3",
      description: "Tìm nhanh trong danh mục",
    },
    focusSalesperson: {
      key: "Alt+N",
      description: "Chọn nhân viên bán hàng",
    },
    focusPriceBook: {
      key: "Alt+B",
      description: "Chọn bảng giá",
    },
    addSession: {
      key: "Alt+1",
      description: "Tạo hóa đơn mới",
    },
    completeCheckout: {
      key: "F9",
      description: "Hoàn tất & in hóa đơn",
    },
    saveDraft: {
      key: "F10",
      description: "Lưu hóa đơn tạm",
    },
    printEstimate: {
      key: "Alt+P",
      description: "In hóa đơn tạm tính",
    },
    focusPayment: {
      key: "F12",
      description: "Nhập tiền khách đưa",
    },
  },
} as const;

/** Định nghĩa kiểu cho mọi entry trong `POS_HOTKEYS`. */
export interface PosHotkeyDef {
  /** Chuỗi phím tắt (`Hotkey` type của TanStack — có autocomplete). */
  key: Hotkey;
  /** Mô tả tiếng Việt — hiển thị trong help/devtools. */
  description: string;
}
