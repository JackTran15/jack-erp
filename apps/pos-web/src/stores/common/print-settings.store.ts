import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RECEIPT_LAYOUT_DEFAULTS } from "@erp/pos/constants/print-settings.constant";
import type { ReceiptLayoutSettings } from "@erp/pos/interfaces/print-settings.interface";

const STORAGE_KEY = "pos-print-settings";
const STORE_VERSION = 1;

interface PosPrintSettingsState {
  version: number;
  settings: ReceiptLayoutSettings;
  setSetting: <K extends keyof ReceiptLayoutSettings>(
    key: K,
    value: ReceiptLayoutSettings[K],
  ) => void;
  replaceSettings: (next: ReceiptLayoutSettings) => void;
  resetSettings: () => void;
}

/**
 * Thông số layout bản in — cấu hình THEO MÁY (localStorage), không đồng bộ lên
 * server. Mỗi quầy có thể dùng máy in khác nhau nên bộ số không thuộc về
 * organization/branch.
 */
export const usePosPrintSettingsStore = create<PosPrintSettingsState>()(
  persist(
    (set) => ({
      version: STORE_VERSION,
      settings: { ...RECEIPT_LAYOUT_DEFAULTS },
      setSetting: (key, value) =>
        set((state) => ({ settings: { ...state.settings, [key]: value } })),
      replaceSettings: (next) => set({ settings: { ...next } }),
      resetSettings: () => set({ settings: { ...RECEIPT_LAYOUT_DEFAULTS } }),
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      partialize: (state) => ({
        version: state.version,
        settings: state.settings,
      }),
      // Spread defaults TRƯỚC rồi mới overlay giá trị đã lưu: thêm field mới ở
      // bản sau không làm vỡ cấu hình cũ (field thiếu tự lấy mặc định), nên
      // không cần bump version mỗi lần bổ sung knob.
      merge: (persisted, current) => {
        const saved = persisted as Partial<PosPrintSettingsState> | undefined;
        const savedSettings =
          saved?.settings && typeof saved.settings === "object"
            ? saved.settings
            : {};
        return {
          ...(current as PosPrintSettingsState),
          version: STORE_VERSION,
          settings: { ...RECEIPT_LAYOUT_DEFAULTS, ...savedSettings },
        };
      },
    },
  ),
);

/**
 * Đọc thông số hiện tại ngoài React. Printer gọi hàm này TẠI THỜI ĐIỂM IN nên
 * luôn lấy giá trị mới nhất.
 */
export function getReceiptLayoutSettings(): ReceiptLayoutSettings {
  return usePosPrintSettingsStore.getState().settings;
}

// Trang cài đặt mở ở TAB RIÊNG, mà zustand/persist không tự đồng bộ giữa các
// tab. `storage` chỉ bắn ở những tab KHÁC tab vừa ghi — đúng thứ cần để tab bán
// hàng đang mở nhận thông số mới mà không phải reload.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    void usePosPrintSettingsStore.persist.rehydrate();
  });
}
