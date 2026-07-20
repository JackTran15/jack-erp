export const treasuryQueryKeys = {
  cashAccounts: (branchId?: string) =>
    ["cash-accounts", branchId] as const,
  myBranchCashAccount: () => ["cash-accounts", "my"] as const,
  cashAccountDetail: (id: string | undefined) =>
    ["cash-accounts", "detail", id] as const,
  cashVoucherCategories: (direction?: string) =>
    ["cash-voucher-categories", direction] as const,
  coaAccounts: () => ["coa-accounts"] as const,
  paymentAccounts: () => ["payment-accounts"] as const,
  cashReceipts: (filters: unknown) => ["cash-receipts", filters] as const,
  cashReceipt: (id: string | undefined) => ["cash-receipts", "detail", id] as const,
  cashPayments: (filters: unknown) => ["cash-payments", filters] as const,
  cashPayment: (id: string | undefined) => ["cash-payments", "detail", id] as const,
  cashCounts: (filters: unknown) => ["cash-counts", filters] as const,
  cashCount: (id: string | undefined) => ["cash-counts", "detail", id] as const,
  cashLedger: (params: unknown) => ["cash-ledger", params] as const,
  depositLedger: (params: unknown) => ["deposit-ledger", params] as const,
  // Shares the "deposit-ledger" prefix so existing invalidations cover it too.
  depositLedgerSearch: (body: unknown) =>
    ["deposit-ledger", "search", body] as const,
  /**
   * Merged receipt+payment stream. A new prefix, so every mutation that used to
   * invalidate only bank-receipts/bank-payments must invalidate this as well.
   */
  depositVouchers: (body: unknown) => ["deposit-vouchers", body] as const,
  depositAccounts: (branchId?: string) =>
    ["deposit-accounts", branchId] as const,
  depositPaymentPolicy: (filters?: unknown) =>
    ["deposit-payment-policy", filters] as const,
  bankReceipts: (filters: unknown) => ["bank-receipts", filters] as const,
  bankReceipt: (id: string | undefined) => ["bank-receipts", "detail", id] as const,
  bankPayments: (filters: unknown) => ["bank-payments", filters] as const,
  bankPayment: (id: string | undefined) => ["bank-payments", "detail", id] as const,
  supplierDepositPaymentSaga: (id: string | undefined) =>
    ["supplier-deposit-payment", "saga", id] as const,
  depositRecon: (query: unknown) => ["deposit-recon", query] as const,
  // Shares the "deposit-recon" prefix so existing invalidations cover it too.
  depositReconSearch: (body: unknown) =>
    ["deposit-recon", "search", body] as const,
  depositPeriodLocks: (branchId: string | undefined) =>
    ["deposit-period-lock", branchId] as const,
  depositTransfers: (filters: unknown) => ["deposit-transfers", filters] as const,
  depositTransfer: (id: string | undefined) =>
    ["deposit-transfers", "detail", id] as const,
  depositInTransit: (filters: unknown) => ["deposit-in-transit", filters] as const,
  depositDashboard: () => ["deposit-dashboard"] as const,
  banks: () => ["banks"] as const,
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
  supplierDebtParties: (query: string, page: number, pageSize: number) =>
    ["voucher-partners", "supplier-debt-parties", query, page, pageSize] as const,
  supplierDebts: (supplierId: string) =>
    ["voucher-partners", "supplier-debts", supplierId] as const,
};
