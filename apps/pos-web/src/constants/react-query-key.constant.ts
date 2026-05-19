/**
 * React Query key registry — xem CLAUDE.md mục 8.1. Tập trung tại 1 chỗ để
 * dễ invalidate by prefix (e.g. invalidate `INVOICE_KEYS.DRAFTS_PREFIX` sẽ
 * ăn mọi `INVOICE_KEYS.DRAFTS(sessionId)` con) và tránh trùng key.
 */

export const ACCOUNT_KEYS = {
  ALL: ["accounts"] as const,
  PAYMENT: ["accounts", "payment"] as const,
  REVENUE: ["accounts", "revenue"] as const,
  RECEIVABLE: ["accounts", "receivable"] as const,
} as const;

export const INVOICE_KEYS = {
  ALL: ["invoices"] as const,
  DRAFTS_PREFIX: ["invoices", "drafts"] as const,
  DRAFTS: (sessionId: string) =>
    ["invoices", "drafts", sessionId] as const,
} as const;
