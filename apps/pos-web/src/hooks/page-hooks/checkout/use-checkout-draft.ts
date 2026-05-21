import { useCallback } from "react";
import { toast } from "sonner";

import {
  useCreateInvoiceMutation,
  useUpdateInvoiceMutation,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import {
  buildCreateInvoicePayload,
  buildUpdateInvoicePayload,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import {
  selectActiveSession,
  selectHasAnyCartLines,
  selectPurchaseCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
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
    const selectedCustomer =
      usePosCheckoutCustomerStore.getState().selectedCustomer;
    const note = usePosCheckoutPaymentStore.getState().note || undefined;
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
            }),
          })
        : await createMutation.mutateAsync(
            buildCreateInvoicePayload({
              sessionId: sessionState.posSessionId,
              cart: purchaseCart,
              customer: selectedCustomer,
              note,
            }),
          );
      const message = sourceInvoiceId
        ? `Đã cập nhật hóa đơn lưu tạm ${saved.code}`
        : `Đã lưu tạm hóa đơn ${saved.code}`;
      usePosCheckoutUiStore.getState().setAnnouncement(`${message}.`);
      toast.success(message);
      sessionState.resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không lưu được hóa đơn lưu tạm",
      );
    }
  }, [createMutation, updateMutation]);

  return {
    saveDraft,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
};
