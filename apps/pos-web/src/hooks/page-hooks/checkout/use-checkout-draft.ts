import { useCallback } from "react";
import { toast } from "sonner";

import {
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import {
  CHECKOUT_ANNOUNCEMENTS,
  CHECKOUT_TOASTS,
} from "@erp/pos/constants/checkout-messages.constant";
import {
  buildCreateInvoicePayload,
  buildUpdateInvoicePayload,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import {
  selectActiveSession,
  selectCustomerDraft,
  selectHasAnyCartLines,
  selectMetaDraft,
  selectPaymentDraft,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutDraftResult {
  saveDraft: () => Promise<void>;
  isSaving: boolean;
}

/**
 * Adapter zero-input: build payload từ stores, gọi `POST /invoices` (DRAFT),
 * reset cart sau khi BE trả về. Lỗi network/backend → toast và giữ nguyên state.
 */
export const useCheckoutDraft = (): UseCheckoutDraftResult => {
  const createMutation = useCreateInvoiceMutation();
  const updateMutation = useUpdateInvoiceMutation();

  const saveDraft = useCallback(async () => {
    const sessionState = usePosCheckoutSessionStore.getState();
    if (!selectHasAnyCartLines(sessionState)) return;

    const purchaseCart = selectPurchaseCart(sessionState);
    const selectedCustomer = selectCustomerDraft(sessionState).selectedCustomer;
    const note = selectPaymentDraft(sessionState).note || undefined;
    const selectedSalesperson =
      selectMetaDraft(sessionState).selectedSalesperson;
    // Tab mở từ một draft đã lưu → PATCH chính draft đó thay vì tạo bản mới.
    const sourceInvoiceId = selectActiveSession(sessionState)?.sourceInvoiceId;

    try {
      const saved = sourceInvoiceId
        ? await updateMutation.mutateAsync({
            id: sourceInvoiceId,
            body: buildUpdateInvoicePayload({
              cart: purchaseCart,
              customer: selectedCustomer,
              note,
              salesperson: selectedSalesperson,
            }),
          })
        : await createMutation.mutateAsync(
            buildCreateInvoicePayload({
              sessionId: sessionState.posSessionId,
              cart: purchaseCart,
              customer: selectedCustomer,
              note,
              salesperson: selectedSalesperson,
            }),
          );
      const message = sourceInvoiceId
        ? CHECKOUT_ANNOUNCEMENTS.draftUpdated(saved.code)
        : CHECKOUT_ANNOUNCEMENTS.draftSaved(saved.code);
      usePosCheckoutUiStore.getState().setAnnouncement(`${message}.`);
      toast.success(message);
      // Draft per-tab nằm trong session → reset session là đủ; xóa thêm UI draft
      // (cờ dialog/cartError) cho gọn.
      sessionState.resetActiveSessionAfterCheckout();
      usePosCheckoutUiStore.getState().resetCheckoutUiDraft();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : CHECKOUT_TOASTS.DRAFT_SAVE_FAILED,
      );
    }
  }, [createMutation, updateMutation]);

  return {
    saveDraft,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
};
