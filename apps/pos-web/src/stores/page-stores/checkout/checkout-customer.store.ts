import { create } from "zustand";

import type { CustomerRow } from "@erp/pos/lib/common/customerApi";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

interface PosCheckoutCustomerState {
  selectedCustomer: CustomerRow | null;
  customerQuery: string;
  customerFieldError: string;
  createCustomerOpen: boolean;
  createDefaultQuery: string;
  editCustomerOpen: boolean;
  customerDetailOpen: boolean;

  setSelectedCustomer: (value: Updater<CustomerRow | null>) => void;
  setCustomerQuery: (value: Updater<string>) => void;
  setCustomerFieldError: (value: Updater<string>) => void;
  setCreateCustomerOpen: (value: Updater<boolean>) => void;
  setCreateDefaultQuery: (value: Updater<string>) => void;
  setEditCustomerOpen: (value: Updater<boolean>) => void;
  setCustomerDetailOpen: (value: Updater<boolean>) => void;

  pickCustomer: (customer: CustomerRow) => void;
  clearCustomer: () => void;

  resetCustomerDraft: () => void;
}

export const usePosCheckoutCustomerStore = create<PosCheckoutCustomerState>()(
  (set) => ({
    selectedCustomer: null,
    customerQuery: "",
    customerFieldError: "",
    createCustomerOpen: false,
    createDefaultQuery: "",
    editCustomerOpen: false,
    customerDetailOpen: false,

    setSelectedCustomer: (value) =>
      set((state) => ({
        selectedCustomer: apply(state.selectedCustomer, value),
      })),
    setCustomerQuery: (value) =>
      set((state) => ({ customerQuery: apply(state.customerQuery, value) })),
    setCustomerFieldError: (value) =>
      set((state) => ({
        customerFieldError: apply(state.customerFieldError, value),
      })),
    setCreateCustomerOpen: (value) =>
      set((state) => ({
        createCustomerOpen: apply(state.createCustomerOpen, value),
      })),
    setCreateDefaultQuery: (value) =>
      set((state) => ({
        createDefaultQuery: apply(state.createDefaultQuery, value),
      })),
    setEditCustomerOpen: (value) =>
      set((state) => ({
        editCustomerOpen: apply(state.editCustomerOpen, value),
      })),
    setCustomerDetailOpen: (value) =>
      set((state) => ({
        customerDetailOpen: apply(state.customerDetailOpen, value),
      })),

    pickCustomer: (customer) =>
      set({
        selectedCustomer: customer,
        customerFieldError: "",
        customerQuery: customer.name?.trim() ?? "",
      }),

    clearCustomer: () =>
      set({
        selectedCustomer: null,
        customerQuery: "",
        customerFieldError: "",
      }),

    resetCustomerDraft: () =>
      set({
        selectedCustomer: null,
        customerQuery: "",
        customerFieldError: "",
        createCustomerOpen: false,
        createDefaultQuery: "",
        editCustomerOpen: false,
        customerDetailOpen: false,
      }),
  }),
);
