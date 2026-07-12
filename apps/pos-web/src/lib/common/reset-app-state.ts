import { clearPinnedItems } from "@erp/pos/lib/common/localstorage";
import { clearPosBranch } from "@erp/pos/lib/common/posBranchStorage";
import { queryClient } from "@erp/pos/lib/common/query-client";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutLabelsStore } from "@erp/pos/stores/page-stores/checkout/checkout-labels.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import { usePosFastStockTransferUiStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-ui.store";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

/**
 * Đưa toàn bộ state phía client về trạng thái ban đầu — gọi khi đăng nhập
 * (kể cả đăng nhập lại sau khi token hết hạn) và khi đăng xuất, để mỗi phiên
 * bắt đầu sạch, không dính dữ liệu của user/phiên trước.
 * KHÔNG đụng token — auth do authService quản lý.
 */
/**
 * Reset các lựa chọn checkout (giỏ hàng + mọi tab, khách, NVBH, KM, thanh toán,
 * nhãn in). Dùng khi đổi chi nhánh (dữ liệu gắn theo chi nhánh) và bởi
 * `resetAppState` lúc đăng nhập/đăng xuất. KHÔNG đụng branch/token/query cache —
 * caller tự lo phần đó.
 */
export function resetCheckoutSelections(): void {
  // resetSession có persist — set() ghi đè key "pos-checkout-sessions".
  usePosCheckoutSessionStore.getState().resetSession();
  usePosCheckoutUiStore.getState().clearAnnouncement();
  usePosCheckoutUiStore.getState().resetCheckoutUiDraft();
  usePosCheckoutLabelsStore.getState().resetLabels();
}

export function resetAppState(): void {
  // React Query: hủy request đang bay (của user/branch cũ) rồi xóa cache.
  void queryClient.cancelQueries();
  queryClient.clear();

  // Store có persist — set() làm middleware ghi đè key localStorage bằng state mới.
  usePosBranchStore.getState().clearBranch(); // key "pos-branch"

  // Checkout (giỏ + tab + nhãn) — key "pos-checkout-sessions" + store in-memory.
  resetCheckoutSelections();

  usePosFastStockTransferWorkflowStore.getState().resetWorkflowAll();
  usePosFastStockTransferUiStore.getState().clearPageError();
  usePosFastStockTransferUiStore.getState().resetDialogs();
  usePosFastStockTransferPickerStore.getState().resetPickerState();

  // Key localStorage rời.
  clearPinnedItems(); // "pos.appHeader.pinnedItemIds"
  clearPosBranch(); // legacy "pos_active_branch_id" / "pos_active_branch_name"
}
