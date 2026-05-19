import { useCallback } from "react";
import { toast } from "sonner";

import { useCreateInvoiceMutation } from "@erp/pos/hooks/react-query/use-invoices";
import { buildCreateInvoicePayload } from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import {
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

  const saveDraft = useCallback(async () => {
    const sessionState = usePosCheckoutSessionStore.getState();
    if (!selectHasAnyCartLines(sessionState)) return;

    const purchaseCart = selectPurchaseCart(sessionState);
    const selectedCustomer =
      usePosCheckoutCustomerStore.getState().selectedCustomer;
    const note = usePosCheckoutPaymentStore.getState().note || undefined;

    const payload = buildCreateInvoicePayload({
      sessionId: sessionState.activeSessionId,
      cart: purchaseCart,
      customer: selectedCustomer,
      note,
    });

    try {
      const created = await createMutation.mutateAsync(payload);
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(`Đã lưu tạm hóa đơn ${created.code}.`);
      toast.success(`Đã lưu tạm hóa đơn ${created.code}`);
      sessionState.resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không lưu được hóa đơn lưu tạm",
      );
    }
  }, [createMutation]);

  return { saveDraft, isSaving: createMutation.isPending };
};
