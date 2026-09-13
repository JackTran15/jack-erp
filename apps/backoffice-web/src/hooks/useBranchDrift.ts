import { useCallback, useSyncExternalStore } from "react";
import { getActiveBranch, hasRefreshToken } from "../lib/auth-storage";

const BRANCH_KEY = "active_branch_id";

export interface BranchDriftState {
  /** Chi nhánh của phiên đã đổi sau khi tab này khởi tạo. */
  drifted: boolean;
  /** Chi nhánh phiên đang đứng — dùng chung mọi tab. */
  sessionBranchId: string | null;
  /** Chi nhánh tab này tin là mình đang đứng, chốt lúc tab khởi tạo. */
  tabBranchId: string | null;
}

// Baseline sống ở tầng module, KHÔNG phải trong useRef của hook: phạm vi của nó là *tab*,
// mà hook này có nhiều chỗ gọi (dialog ở BackofficeLayout, BranchSelector để reset). Mỗi
// instance một ref là mỗi instance một sự thật, và resetBaseline() ở chỗ này sẽ không tới
// được dialog ở chỗ kia.
let baseline: string | null = null;
let snapshot: BranchDriftState = {
  drifted: false,
  sessionBranchId: null,
  tabBranchId: null,
};
const listeners = new Set<() => void>();

/**
 * Chi nhánh mà server thực sự dùng, đọc gián tiếp qua `active_branch_id`.
 *
 * Backoffice không đọc được từ JWT: access token nằm trong bộ nhớ tab, và jti của tab đã
 * bị `switchBranch` thu hồi ngay khi tab khác đổi chi nhánh. `active_branch_id` là tín
 * hiệu dùng chung duy nhất, và nó được ghi cùng lúc với việc đổi phiên.
 *
 * Trả `null` khi phiên không còn — đăng xuất ở tab khác không được bật dialog chi nhánh.
 */
function readSessionBranch(): string | null {
  try {
    if (!hasRefreshToken()) return null;
    return getActiveBranch();
  } catch {
    // localStorage bị chặn (chế độ riêng tư): im lặng coi như không lệch. Hook này mount
    // trên mọi trang nên nó không được phép làm sập layout.
    return null;
  }
}

function computeSnapshot(): BranchDriftState {
  const sessionBranchId = readSessionBranch();
  // Lần đọc đầu tiên có phiên sẽ chốt baseline, và nó không bao giờ tự ghi lại sau đó.
  if (baseline === null && sessionBranchId !== null) {
    baseline = sessionBranchId;
  }
  return {
    drifted: sessionBranchId !== null && baseline !== null && sessionBranchId !== baseline,
    sessionBranchId,
    tabBranchId: baseline,
  };
}

function refresh(): void {
  const next = computeSnapshot();
  if (
    next.drifted === snapshot.drifted &&
    next.sessionBranchId === snapshot.sessionBranchId &&
    next.tabBranchId === snapshot.tabBranchId
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent): void {
  // `key === null` là localStorage.clear(). Sự kiện này chỉ bắn ở tab KHÁC, nên tab vừa
  // tự đổi chi nhánh không tự hỏi lại chính mình.
  if (event.key !== null && event.key !== BRANCH_KEY) return;
  refresh();
}

function handleVisibility(): void {
  if (document.visibilityState === "visible") refresh();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (listeners.size === 1) {
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
  }
  // `storage` có thể rơi mất khi trình duyệt đóng băng tab; focus/visibility là lưới an toàn.
  refresh();
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    }
  };
}

function getSnapshot(): BranchDriftState {
  return snapshot;
}

/** Chốt lại baseline theo chi nhánh hiện tại — dùng khi chính tab này đổi chi nhánh. */
export function resetBranchDriftBaseline(): void {
  baseline = readSessionBranch();
  refresh();
}

export function useBranchDrift(): BranchDriftState & { resetBaseline: () => void } {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const resetBaseline = useCallback(() => resetBranchDriftBaseline(), []);
  return { ...state, resetBaseline };
}
