import { useCallback } from "react";

import { useCheckoutFinalize } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-finalize";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutOversellFlowResult {
  confirmOversell: () => Promise<void>;
}

/**
 * Khi user đã đồng ý "vẫn bán" trên OversellCheckoutConfirmDialog: đóng
 * dialog rồi gọi `finalizeCheckoutAndPrint({bypassOversellModal: true})`.
 */
export function useCheckoutOversellFlow(): UseCheckoutOversellFlowResult {
  const { finalizeCheckoutAndPrint } = useCheckoutFinalize();

  const confirmOversell = useCallback(async () => {
    usePosCheckoutUiStore.getState().closeOversell();
    await finalizeCheckoutAndPrint({ bypassOversellModal: true });
  }, [finalizeCheckoutAndPrint]);

  return { confirmOversell };
}
