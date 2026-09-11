import { useCallback, useSyncExternalStore } from "react";
import {
  POS_ACCESS_TOKEN_KEY,
  POS_REFRESH_TOKEN_KEY,
} from "@erp/pos/constants/common.constant";
import { parseAccessTokenPayload } from "@erp/pos/lib/common/parseJwt";

export interface PosBranchDriftState {
  /** Chi nhánh của phiên đã đổi sau khi tab này khởi tạo. */
  drifted: boolean;
  /** Chi nhánh trong access token — dùng chung mọi tab, và là thứ server thực sự dùng. */
  sessionBranchId: string | null;
  /** Chi nhánh tab này tin là mình đang đứng, chốt lúc tab khởi tạo. */
  tabBranchId: string | null;
}

// Baseline sống ở tầng module, KHÔNG phải trong useRef của hook. Ở POS đây không phải
// chuyện sạch sẽ mà là chuyện đúng/sai: đổi chi nhánh ở POS không reload trang, nên nếu
// PosLocationIndicator reset baseline của instance nó mà dialog ôm baseline riêng, tab vừa
// tự đổi chi nhánh sẽ lập tức tự bật dialog hỏi chính mình.
let baseline: string | null = null;
let snapshot: PosBranchDriftState = {
  drifted: false,
  sessionBranchId: null,
  tabBranchId: null,
};
const listeners = new Set<() => void>();

/**
 * Chi nhánh của phiên, đọc thẳng từ JWT.
 *
 * `@Actor` giải branchId theo thứ tự `jwt > header > jwtList`, nên `branchId` trong token
 * chính là chi nhánh mà server đang trả dữ liệu — không phải khoá persist `pos-branch`,
 * thứ chỉ nói ý muốn của tab đã ghi. Token POS nằm ở localStorage nên mọi tab dùng chung.
 *
 * Trả `null` khi phiên không còn, hoặc khi token không giải được: một token đọc không ra
 * không phải bằng chứng có lệch, và dialog chặn màn hình là thứ đắt nhất để bật nhầm.
 */
function readSessionBranch(): string | null {
  try {
    if (!localStorage.getItem(POS_REFRESH_TOKEN_KEY)) return null;
    const token = localStorage.getItem(POS_ACCESS_TOKEN_KEY);
    if (!token) return null;
    return parseAccessTokenPayload(token)?.branchId ?? null;
  } catch {
    return null;
  }
}

function computeSnapshot(): PosBranchDriftState {
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
  if (event.key !== null && event.key !== POS_ACCESS_TOKEN_KEY) return;
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

function getSnapshot(): PosBranchDriftState {
  return snapshot;
}

/** Chốt lại baseline theo chi nhánh hiện tại — dùng khi chính tab này đổi chi nhánh. */
export function resetPosBranchDriftBaseline(): void {
  baseline = readSessionBranch();
  refresh();
}

export function usePosBranchDrift(): PosBranchDriftState & {
  resetBaseline: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  const resetBaseline = useCallback(() => resetPosBranchDriftBaseline(), []);
  return { ...state, resetBaseline };
}
