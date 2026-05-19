import { useCallback } from "react";
import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  formatCustomerDisplay,
  searchCustomers,
  type CustomerRow,
} from "@erp/pos/lib/common/customerApi";
import { customerSearchErrorMessage } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

/**
 * Zero-input adapter cho customer state + dialog handlers.
 * `announce` đọc từ ui store, `clearKeepChange` gọi từ payment store khi pick.
 */
export function useCheckoutCustomer() {
  const selectedCustomer = usePosCheckoutCustomerStore(
    (s) => s.selectedCustomer,
  );
  const setSelectedCustomer = usePosCheckoutCustomerStore(
    (s) => s.setSelectedCustomer,
  );
  const customerQuery = usePosCheckoutCustomerStore((s) => s.customerQuery);
  const setCustomerQuery = usePosCheckoutCustomerStore(
    (s) => s.setCustomerQuery,
  );
  const customerFieldError = usePosCheckoutCustomerStore(
    (s) => s.customerFieldError,
  );
  const setCustomerFieldError = usePosCheckoutCustomerStore(
    (s) => s.setCustomerFieldError,
  );
  const createCustomerOpen = usePosCheckoutCustomerStore(
    (s) => s.createCustomerOpen,
  );
  const setCreateCustomerOpen = usePosCheckoutCustomerStore(
    (s) => s.setCreateCustomerOpen,
  );
  const createDefaultQuery = usePosCheckoutCustomerStore(
    (s) => s.createDefaultQuery,
  );
  const setCreateDefaultQuery = usePosCheckoutCustomerStore(
    (s) => s.setCreateDefaultQuery,
  );
  const editCustomerOpen = usePosCheckoutCustomerStore(
    (s) => s.editCustomerOpen,
  );
  const setEditCustomerOpen = usePosCheckoutCustomerStore(
    (s) => s.setEditCustomerOpen,
  );
  const customerDetailOpen = usePosCheckoutCustomerStore(
    (s) => s.customerDetailOpen,
  );
  const setCustomerDetailOpen = usePosCheckoutCustomerStore(
    (s) => s.setCustomerDetailOpen,
  );
  const pickCustomerAction = usePosCheckoutCustomerStore(
    (s) => s.pickCustomer,
  );
  const clearCustomerAction = usePosCheckoutCustomerStore(
    (s) => s.clearCustomer,
  );

  const customerSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<CustomerRow>[]> => {
      const res = await searchCustomers(q);
      return res.data.slice(0, 8).map((c) => ({ item: c }));
    },
    [],
  );

  const pickCustomer = useCallback(
    (c: CustomerRow, announceMessage?: string) => {
      pickCustomerAction(c);
      usePosCheckoutPaymentStore.getState().clearKeepChange();
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(
          announceMessage ?? `Đã chọn khách ${formatCustomerDisplay(c)}.`,
        );
    },
    [pickCustomerAction],
  );

  const handleCustomerSubmitQuery = useCallback(
    (raw: string): boolean => {
      if (raw.length < 2) {
        setCustomerFieldError("Nhập ít nhất 2 ký tự.");
        return true;
      }
      setCustomerFieldError("");
      void (async () => {
        try {
          const res = await searchCustomers(raw);
          const rows = res.data;
          if (rows.length === 1) {
            pickCustomer(rows[0]!);
            return;
          }
          if (rows.length > 1) {
            setCustomerFieldError("Nhiều kết quả — chọn từ gợi ý bên dưới.");
            return;
          }
          setCreateDefaultQuery(raw);
          setCreateCustomerOpen(true);
        } catch (err) {
          setCustomerFieldError(customerSearchErrorMessage(err));
        }
      })();
      return true;
    },
    [
      pickCustomer,
      setCustomerFieldError,
      setCreateDefaultQuery,
      setCreateCustomerOpen,
    ],
  );

  const handleClearCustomer = useCallback(() => {
    clearCustomerAction();
    usePosCheckoutUiStore.getState().setAnnouncement("Khách lẻ.");
  }, [clearCustomerAction]);

  const handleAddCustomer = useCallback(() => {
    setCreateDefaultQuery(customerQuery.trim());
    setCreateCustomerOpen(true);
  }, [customerQuery, setCreateDefaultQuery, setCreateCustomerOpen]);

  const handleEditCustomer = useCallback(() => {
    setEditCustomerOpen(true);
  }, [setEditCustomerOpen]);

  const handleOpenCustomerDetail = useCallback(() => {
    setCustomerDetailOpen(true);
  }, [setCustomerDetailOpen]);

  const closeCustomerDetail = useCallback(() => {
    setCustomerDetailOpen(false);
  }, [setCustomerDetailOpen]);

  const handleEditFromDetail = useCallback(() => {
    setCustomerDetailOpen(false);
    setEditCustomerOpen(true);
  }, [setCustomerDetailOpen, setEditCustomerOpen]);

  // Dialog lifecycle handlers
  const closeCreateDialog = useCallback(() => {
    setCreateCustomerOpen(false);
    usePosCheckoutUiStore.getState().setCreateCustomerSucceeded(false);
  }, [setCreateCustomerOpen]);

  const handleCustomerCreated = useCallback(
    (c: CustomerRow) => {
      usePosCheckoutUiStore.getState().setCreateCustomerSucceeded(true);
      setCreateCustomerOpen(false);
      pickCustomer(c, `Đã tạo và chọn khách ${formatCustomerDisplay(c)}.`);
    },
    [pickCustomer, setCreateCustomerOpen],
  );

  const closeEditDialog = useCallback(() => {
    setEditCustomerOpen(false);
  }, [setEditCustomerOpen]);

  const handleCustomerSubmitted = useCallback(
    (c: CustomerRow) => {
      setEditCustomerOpen(false);
      pickCustomer(c, `Đã cập nhật khách ${formatCustomerDisplay(c)}.`);
    },
    [pickCustomer, setEditCustomerOpen],
  );

  return {
    selectedCustomer,
    setSelectedCustomer,
    customerQuery,
    setCustomerQuery,
    customerFieldError,
    setCustomerFieldError,
    createCustomerOpen,
    setCreateCustomerOpen,
    createDefaultQuery,
    setCreateDefaultQuery,
    editCustomerOpen,
    setEditCustomerOpen,
    customerDetailOpen,
    setCustomerDetailOpen,
    customerSearchAdapter,
    pickCustomer,
    handleCustomerSubmitQuery,
    handleClearCustomer,
    handleAddCustomer,
    handleEditCustomer,
    handleOpenCustomerDetail,
    closeCustomerDetail,
    handleEditFromDetail,
    closeCreateDialog,
    handleCustomerCreated,
    closeEditDialog,
    handleCustomerSubmitted,
  };
}
