import { useCallback } from "react";
import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  CHECKOUT_ANNOUNCEMENTS,
  CHECKOUT_ERRORS,
} from "@erp/pos/constants/checkout-messages.constant";
import {
  formatCustomerDisplay,
  phoneDigitsOnly,
} from "@erp/pos/lib/common/customerUtils";
import {
  useCustomerListQuery,
  useCustomerSearch,
} from "@erp/pos/hooks/react-query/use-query-customer";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import { customerSearchErrorMessage } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  selectCustomerDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

/**
 * Zero-input adapter cho customer state + dialog handlers.
 * `selectedCustomer`/`customerQuery` là per-tab (session draft); cờ dialog +
 * `customerFieldError` là transient toàn cục (ui store). `announce` đọc ui store.
 */
export function useCheckoutCustomer() {
  // Per-tab: khách đã chọn + ô tìm khách (session draft).
  const { selectedCustomer, customerQuery } = usePosCheckoutSessionStore(
    selectCustomerDraft,
  );
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );
  const pickCustomerAction = usePosCheckoutSessionStore((s) => s.pickCustomer);
  const clearCustomerAction = usePosCheckoutSessionStore((s) => s.clearCustomer);

  const setSelectedCustomer = useCallback(
    (value: Updater<CustomerRow | null>) =>
      updateDraftSlice("customer", (c) => ({
        ...c,
        selectedCustomer: apply(c.selectedCustomer, value),
      })),
    [updateDraftSlice],
  );
  const setCustomerQuery = useCallback(
    (value: Updater<string>) =>
      updateDraftSlice("customer", (c) => ({
        ...c,
        customerQuery: apply(c.customerQuery, value),
      })),
    [updateDraftSlice],
  );

  // Transient (ui store): cờ dialog + lỗi field — không theo tab.
  const customerFieldError = usePosCheckoutUiStore((s) => s.customerFieldError);
  const setCustomerFieldError = usePosCheckoutUiStore(
    (s) => s.setCustomerFieldError,
  );
  const createCustomerOpen = usePosCheckoutUiStore((s) => s.createCustomerOpen);
  const setCreateCustomerOpen = usePosCheckoutUiStore(
    (s) => s.setCreateCustomerOpen,
  );
  const createDefaultQuery = usePosCheckoutUiStore((s) => s.createDefaultQuery);
  const setCreateDefaultQuery = usePosCheckoutUiStore(
    (s) => s.setCreateDefaultQuery,
  );
  const customerDetailOpen = usePosCheckoutUiStore((s) => s.customerDetailOpen);
  const setCustomerDetailOpen = usePosCheckoutUiStore(
    (s) => s.setCustomerDetailOpen,
  );

  const { search } = useCustomerSearch();
  // Prefetch một trang khách (50) ngay khi CustomerSection mount → click vào ô
  // khách là hiện danh sách + lọc local tức thì, không cần gọi API mỗi lần gõ.
  const customerListQuery = useCustomerListQuery({ pageSize: 50 });
  const prefetched = customerListQuery.data?.data;

  const customerSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<CustomerRow>[]> => {
      const list = prefetched ?? [];
      const term = q.trim().toLowerCase();

      // Chưa gõ gì (focus) → hiện danh sách prefetch.
      if (!term) return list.slice(0, 8).map((c) => ({ item: c }));

      // Lọc local theo tên hoặc SĐT trước khi gọi server.
      const digits = phoneDigitsOnly(term);
      const local = list.filter((c) => {
        const nameHit = formatCustomerDisplay(c).toLowerCase().includes(term);
        const phoneHit =
          digits.length > 0 && c.phone
            ? phoneDigitsOnly(c.phone).includes(digits)
            : false;
        return nameHit || phoneHit;
      });
      if (local.length > 0) return local.slice(0, 8).map((c) => ({ item: c }));

      // Không khớp trong danh sách prefetch → fallback gọi API search.
      const res = await search(q);
      return res.data.slice(0, 8).map((c) => ({ item: c }));
    },
    [prefetched, search],
  );

  const pickCustomer = useCallback(
    (c: CustomerRow, announceMessage?: string) => {
      pickCustomerAction(c);
      // Ngừng giữ tiền thừa + xóa lỗi field (giờ ở ui store) khi chọn khách.
      updateDraftSlice("payment", (p) => ({ ...p, keepChange: false }));
      // Đổi khách → reset điểm áp dụng (điểm thuộc về khách cũ, không xài
      // được cho khách mới). BE cũng kiểm tra `customerId` của draft khi
      // redeem-points; clear local để UX khớp.
      updateDraftSlice("promotion", (p) => ({ ...p, pointsRedeemed: 0 }));
      usePosCheckoutUiStore.getState().setCustomerFieldError("");
      usePosCheckoutUiStore
        .getState()
        .setAnnouncement(
          announceMessage ??
            CHECKOUT_ANNOUNCEMENTS.pickedCustomer(formatCustomerDisplay(c)),
        );
    },
    [pickCustomerAction, updateDraftSlice],
  );

  const handleCustomerSubmitQuery = useCallback(
    (raw: string): boolean => {
      if (raw.length < 2) {
        setCustomerFieldError(CHECKOUT_ERRORS.CUSTOMER_MIN_CHARS);
        return true;
      }
      setCustomerFieldError("");
      void (async () => {
        try {
          const res = await search(raw);
          const rows = res.data;
          if (rows.length === 1) {
            pickCustomer(rows[0]!);
            return;
          }
          if (rows.length > 1) {
            setCustomerFieldError(CHECKOUT_ERRORS.CUSTOMER_MULTIPLE_RESULTS);
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
      search,
      pickCustomer,
      setCustomerFieldError,
      setCreateDefaultQuery,
      setCreateCustomerOpen,
    ],
  );

  const handleClearCustomer = useCallback(() => {
    clearCustomerAction();
    // Khách bị xóa → không còn ai để dùng điểm; reset để right pane không
    // hiện row "Giảm giá (điểm)" mồ côi.
    updateDraftSlice("promotion", (p) => ({ ...p, pointsRedeemed: 0 }));
    // Công nợ cần khách hàng → xóa khách thì bỏ tích nợ + reset hạn thanh toán
    // (debt=false ⇒ debtAmount tự về 0, nút "Hạn thanh toán" tự ẩn).
    updateDraftSlice("payment", (p) => ({
      ...p,
      debt: false,
      paymentDueDate: null,
      creditDays: null,
    }));
    usePosCheckoutUiStore.getState().setCustomerFieldError("");
    usePosCheckoutUiStore
      .getState()
      .setAnnouncement(CHECKOUT_ANNOUNCEMENTS.RETAIL_CUSTOMER);
  }, [clearCustomerAction, updateDraftSlice]);

  const handleAddCustomer = useCallback(() => {
    setCreateDefaultQuery(customerQuery.trim());
    setCreateCustomerOpen(true);
  }, [customerQuery, setCreateDefaultQuery, setCreateCustomerOpen]);

  const handleOpenCustomerDetail = useCallback(() => {
    setCustomerDetailOpen(true);
  }, [setCustomerDetailOpen]);

  const closeCustomerDetail = useCallback(() => {
    setCustomerDetailOpen(false);
  }, [setCustomerDetailOpen]);

  // Dialog lifecycle handlers
  const closeCreateDialog = useCallback(() => {
    setCreateCustomerOpen(false);
    usePosCheckoutUiStore.getState().setCreateCustomerSucceeded(false);
  }, [setCreateCustomerOpen]);

  const handleCustomerCreated = useCallback(
    (c: CustomerRow) => {
      usePosCheckoutUiStore.getState().setCreateCustomerSucceeded(true);
      setCreateCustomerOpen(false);
      pickCustomer(
        c,
        CHECKOUT_ANNOUNCEMENTS.createdAndPickedCustomer(
          formatCustomerDisplay(c),
        ),
      );
    },
    [pickCustomer, setCreateCustomerOpen],
  );

  const handleCustomerSubmitted = useCallback(
    (c: CustomerRow) => {
      pickCustomer(
        c,
        CHECKOUT_ANNOUNCEMENTS.updatedCustomer(formatCustomerDisplay(c)),
      );
    },
    [pickCustomer],
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
    customerDetailOpen,
    setCustomerDetailOpen,
    customerSearchAdapter,
    pickCustomer,
    handleCustomerSubmitQuery,
    handleClearCustomer,
    handleAddCustomer,
    handleOpenCustomerDetail,
    closeCustomerDetail,
    closeCreateDialog,
    handleCustomerCreated,
    handleCustomerSubmitted,
  };
}
