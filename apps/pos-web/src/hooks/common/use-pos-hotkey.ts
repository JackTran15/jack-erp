import {
  useHotkey,
  type UseHotkeyOptions,
} from "@tanstack/react-hotkeys";
import type { PosHotkeyDef } from "@erp/pos/constants/hotkeys.constant";

/**
 * Wrapper mỏng quanh `useHotkey` của @tanstack/react-hotkeys.
 *
 * - Nhận `PosHotkeyDef` (từ `POS_HOTKEYS` registry) thay vì chuỗi trần — bắt buộc
 *   mọi phím tắt phải khai báo qua registry, không scatter strings khắp codebase.
 * - Auto-attach `meta.description` để TanStack devtools (và help-overlay tương lai)
 *   thấy đúng tên tiếng Việt.
 * - Mặc định `ignoreInputs: false` — POS cần phím tắt vẫn fire khi cashier
 *   đang gõ trong input (vd: đang gõ tiền khách đưa → F9 hoàn tất).
 *
 * @param def    Entry từ `POS_HOTKEYS`
 * @param callback Hàm chạy khi phím được nhấn
 * @param options Tùy chọn ghi đè: `enabled`, `target`, `preventDefault`, ...
 */
export function usePosHotkey(
  def: PosHotkeyDef,
  callback: () => void,
  options?: UseHotkeyOptions,
): void {
  useHotkey(
    def.key,
    () => callback(),
    {
      ignoreInputs: false,
      meta: { description: def.description },
      ...options,
    },
  );
}
