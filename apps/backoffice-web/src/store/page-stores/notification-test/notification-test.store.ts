import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NOTIFICATION_TEST_UNLOCK_TTL_MS } from "./notification-test.constant";
import type { NotificationTestState } from "./notification-test.interface";

/**
 * Nhớ "đã nhập mã" cho trang Test thông báo, giữ qua reload nhưng hết hạn sau
 * `NOTIFICATION_TEST_UNLOCK_TTL_MS` — máy để quên ở quầy thì hôm sau phải nhập lại.
 *
 * Chỉ state UI. Dữ liệu thiết bị / nhật ký gửi đi qua TanStack Query.
 */
export const useNotificationTestStore = create<NotificationTestState>()(
  persist(
    (set) => ({
      unlockedAt: null,
      actions: {
        unlock: () => set({ unlockedAt: Date.now() }),
        lock: () => set({ unlockedAt: null }),
      },
    }),
    {
      name: "bo-notification-test",
      partialize: (state) => ({ unlockedAt: state.unlockedAt }),
    },
  ),
);

export const useNotificationTestActions = () =>
  useNotificationTestStore((s) => s.actions);

/** Còn hiệu lực hay không — tính tại chỗ gọi để không phải hẹn giờ. */
export function isUnlockValid(unlockedAt: number | null): boolean {
  return (
    unlockedAt !== null &&
    Date.now() - unlockedAt < NOTIFICATION_TEST_UNLOCK_TTL_MS
  );
}
