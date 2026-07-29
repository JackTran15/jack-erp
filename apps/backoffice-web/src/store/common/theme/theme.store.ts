import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_THEME_ID,
  isThemeId,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
} from "./theme.constant";
import type { ThemeId, ThemeState } from "./theme.interface";

/**
 * Gắn theme lên <html>. Mọi token màu đọc từ selector [data-theme="..."] trong
 * index.css, nên đây là chỗ duy nhất chạm DOM khi đổi theme.
 * index.html đã set sẵn thuộc tính này trước paint đầu tiên để khỏi nháy màu.
 */
function applyTheme(id: ThemeId) {
  document.documentElement.dataset[THEME_ATTRIBUTE] = id;
}

/** localStorage có thể còn id của theme đã bị gỡ — rơi về mặc định thay vì treo. */
function resolveThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      setTheme: (id) => {
        const next = resolveThemeId(id);
        applyTheme(next);
        set({ themeId: next });
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (state) => ({ themeId: state.themeId }),
      merge: (persisted, current) => ({
        ...current,
        themeId: resolveThemeId((persisted as Partial<ThemeState> | undefined)?.themeId),
      }),
      onRehydrateStorage: () => (state) => {
        applyTheme(resolveThemeId(state?.themeId));
      },
    },
  ),
);

export const useActiveThemeId = () => useThemeStore((s) => s.themeId);
