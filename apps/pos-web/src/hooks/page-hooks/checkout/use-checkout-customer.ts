import { useCallback, useState } from "react";
import type { SearchSuggestion } from "@erp/pos/components/page-components/Checkout/SearchPopover/SearchPopover";
import { type CustomerRow, searchCustomers } from "@erp/pos/lib/common/customerApi";
import { customerSearchErrorMessage } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";

interface UseCheckoutCustomerInput {
  announce: (message: string) => void;
  formatCustomerLabel: (customer: CustomerRow) => string;
  onCustomerSelected?: (customer: CustomerRow) => void;
}

export function useCheckoutCustomer({
  announce,
  formatCustomerLabel,
  onCustomerSelected,
}: UseCheckoutCustomerInput) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerFieldError, setCustomerFieldError] = useState("");
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createDefaultQuery, setCreateDefaultQuery] = useState("");
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);

  const customerSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<CustomerRow>[]> => {
      const res = await searchCustomers(q);
      return res.data.slice(0, 8).map((c) => ({ item: c }));
    },
    [],
  );

  const pickCustomer = useCallback(
    (c: CustomerRow, announceMessage?: string) => {
      setSelectedCustomer(c);
      setCustomerFieldError("");
      setCustomerQuery(c.name?.trim() ?? "");
      onCustomerSelected?.(c);
      announce(announceMessage ?? `Đã chọn khách ${formatCustomerLabel(c)}.`);
    },
    [announce, formatCustomerLabel, onCustomerSelected],
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
    [pickCustomer],
  );

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerFieldError("");
    announce("Khách lẻ.");
  }, [announce]);

  const handleAddCustomer = useCallback(() => {
    setCreateDefaultQuery(customerQuery.trim());
    setCreateCustomerOpen(true);
  }, [customerQuery]);

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
    customerSearchAdapter,
    pickCustomer,
    handleCustomerSubmitQuery,
    handleClearCustomer,
    handleAddCustomer,
  };
}
