import type { Dispatch, SetStateAction } from "react";
import {
  createPaymentLine,
  type PaymentLine,
} from "@erp/pos/components/page-components/Checkout/Payment/PaymentMethodRow/PaymentMethodRow";
import type { CartLine } from "./checkout.types";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import type { CustomerRow } from "@erp/pos/lib/common/customerApi";

interface ResetCheckoutSaleSessionInput {
  /** Optional when cart lives in Zustand (`usePosCheckoutSessionStore`). */
  setCart?: Dispatch<SetStateAction<CartLine[]>>;
  setSelectedLineId?: Dispatch<SetStateAction<string | null>>;
  setSelectedCustomer: Dispatch<SetStateAction<CustomerRow | null>>;
  setCustomerQuery: Dispatch<SetStateAction<string>>;
  setCustomerFieldError: Dispatch<SetStateAction<string>>;
  setPaymentLines: Dispatch<SetStateAction<PaymentLine[]>>;
  setSelectedSuggestionId: Dispatch<SetStateAction<string | null>>;
  setNote: Dispatch<SetStateAction<string>>;
  setKeepChange: Dispatch<SetStateAction<boolean>>;
  setDebt: Dispatch<SetStateAction<boolean>>;
}

export function resetCheckoutSaleSession({
  setCart,
  setSelectedLineId,
  setSelectedCustomer,
  setCustomerQuery,
  setCustomerFieldError,
  setPaymentLines,
  setSelectedSuggestionId,
  setNote,
  setKeepChange,
  setDebt,
}: ResetCheckoutSaleSessionInput): void {
  setCart?.([]);
  setSelectedLineId?.(null);
  setSelectedCustomer(null);
  setCustomerQuery("");
  setCustomerFieldError("");
  setPaymentLines([createPaymentLine(PaymentMethodEnum.CASH)]);
  setSelectedSuggestionId(null);
  setNote("");
  setKeepChange(false);
  setDebt(false);
}
