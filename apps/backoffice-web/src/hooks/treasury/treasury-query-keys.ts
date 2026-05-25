export const treasuryQueryKeys = {
  cashAccounts: (branchId?: string) =>
    ["cash-accounts", branchId] as const,
  cashVoucherCategories: (direction?: string) =>
    ["cash-voucher-categories", direction] as const,
  coaAccounts: () => ["coa-accounts"] as const,
  cashReceipts: (filters: unknown) => ["cash-receipts", filters] as const,
  cashReceipt: (id: string | undefined) => ["cash-receipts", "detail", id] as const,
  cashPayments: (filters: unknown) => ["cash-payments", filters] as const,
  cashPayment: (id: string | undefined) => ["cash-payments", "detail", id] as const,
  cashCounts: (filters: unknown) => ["cash-counts", filters] as const,
  cashCount: (id: string | undefined) => ["cash-counts", "detail", id] as const,
  cashLedger: (params: unknown) => ["cash-ledger", params] as const,
  partnerSearch: (type: string, query: string, page: number, pageSize: number) =>
    ["voucher-partners", "search", type, query, page, pageSize] as const,
  partnerById: (partnerType: string | undefined, partnerId: string | undefined) =>
    ["voucher-partners", "detail", partnerType, partnerId] as const,
  staffById: (id: string | undefined) =>
    ["voucher-partners", "staff", id] as const,
  debtCollectionParties: (query: string, page: number, pageSize: number) =>
    ["voucher-partners", "debt-parties", query, page, pageSize] as const,
  customerDebts: (customerId: string) =>
    ["voucher-partners", "customer-debts", customerId] as const,
};
