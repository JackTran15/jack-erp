import { useCallback, useMemo, useRef, type RefObject } from "react";

export interface CheckoutFocusRefs {
  productSearch: RefObject<HTMLInputElement | null>;
  customerSearch: RefObject<HTMLInputElement | null>;
  paymentAmount: RefObject<HTMLInputElement | null>;
  addCustomerButton: RefObject<HTMLButtonElement | null>;
  catalogSearch: RefObject<HTMLInputElement | null>;
  salesperson: RefObject<HTMLInputElement | null>;
  priceBook: RefObject<HTMLInputElement | null>;
}

export interface CheckoutFocusManager {
  refs: CheckoutFocusRefs;
  focusProductSearch: () => void;
  focusProductSearchAndSelect: () => void;
  focusPaymentAmount: () => void;
}

export const useCheckoutFocusManager = (): CheckoutFocusManager => {
  const productSearch = useRef<HTMLInputElement>(null);
  const customerSearch = useRef<HTMLInputElement>(null);
  const paymentAmount = useRef<HTMLInputElement>(null);
  const addCustomerButton = useRef<HTMLButtonElement>(null);
  const catalogSearch = useRef<HTMLInputElement>(null);
  const salesperson = useRef<HTMLInputElement>(null);
  const priceBook = useRef<HTMLInputElement>(null);

  const focusProductSearch = useCallback(() => {
    productSearch.current?.focus();
  }, []);

  const focusProductSearchAndSelect = useCallback(() => {
    productSearch.current?.focus();
    productSearch.current?.select();
  }, []);

  const focusPaymentAmount = useCallback(() => {
    paymentAmount.current?.focus();
  }, []);

  const refs = useMemo<CheckoutFocusRefs>(
    () => ({
      productSearch,
      customerSearch,
      paymentAmount,
      addCustomerButton,
      catalogSearch,
      salesperson,
      priceBook,
    }),
    [],
  );

  return useMemo<CheckoutFocusManager>(
    () => ({
      refs,
      focusProductSearch,
      focusProductSearchAndSelect,
      focusPaymentAmount,
    }),
    [refs, focusProductSearch, focusProductSearchAndSelect, focusPaymentAmount],
  );
};
