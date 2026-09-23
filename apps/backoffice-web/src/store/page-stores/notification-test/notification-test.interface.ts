export interface NotificationTestState {
  /** Thời điểm nhập đúng mã, tính bằng ms. `null` = chưa mở khoá. */
  unlockedAt: number | null;
  actions: {
    unlock: () => void;
    lock: () => void;
  };
}
