import { useQuery } from "@tanstack/react-query";
import type { InvoiceDetailView } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  LedgerCashInvoiceKindEnum,
  type LedgerCashInvoiceDetail,
  type LedgerCashInvoicePayment,
} from "../../pages/treasury/ledger-cash/ledger-cash.types";

/**
 * Vietnamese labels for the raw `InvoicePaymentMethod` values the API returns.
 * An unknown method falls back to its raw value rather than being dropped, so a
 * new payment method still shows up in the breakdown.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Tiền gửi (chuyển khoản)",
  card: "Thẻ",
};

function toPaymentBreakdown(
  payments: { method: string; amount: number }[],
): LedgerCashInvoicePayment[] {
  // One row per method: a sale split across two card accounts reads as a single
  // "Thẻ" line, matching how the cashier thinks about the tender.
  const byMethod = new Map<string, number>();
  for (const p of payments) {
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
  }
  return [...byMethod.entries()].map(([method, amount]) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method] ?? method,
    amount,
  }));
}

/**
 * `InvoiceDetailView` (what the API returns) → `LedgerCashInvoiceDetail` (what
 * `InvoiceDetailDialog` renders). The two shapes were built independently and
 * disagree on names (`discount`/`lineTotal` vs `discountAmount`/`totalAmount`)
 * and on `issuedAt` (ISO string vs Date), so the dialog needs this adapter
 * rather than the raw payload.
 */
export function toLedgerCashInvoiceDetail(
  view: InvoiceDetailView,
): LedgerCashInvoiceDetail {
  return {
    // The report endpoint has no return-invoice concept yet; every row it serves
    // is a normal sale.
    kind: LedgerCashInvoiceKindEnum.PAYMENT,
    code: view.code,
    cashier: view.cashier ?? "",
    customer: view.customerName ?? "",
    issuedAt: view.issuedAt ? new Date(view.issuedAt) : new Date(),
    phone: view.customerPhone ?? undefined,
    salesChannel: view.salesChannel ?? "",
    lines: view.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineAmount: l.lineAmount,
      discountAmount: l.discount,
      totalAmount: l.lineTotal,
      note: l.note ?? undefined,
    })),
    totalPayment: view.totalAmount,
    goodsAmount: view.subtotal,
    customerPaid: view.totalPaid,
    // Only the payment lines actually tendered in cash — not the whole total,
    // which would mislabel a card/transfer sale as cash.
    cashAmount: view.payments
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + p.amount, 0),
    payments: toPaymentBreakdown(view.payments),
  };
}

/**
 * Invoice detail for a treasury drill-down, looked up by invoice code — which is
 * exactly what `deposit_movements.document_number` already holds for POS rows.
 */
export function useInvoiceDetailByCode(code: string | undefined) {
  return useQuery({
    queryKey: ["invoice-detail", code],
    queryFn: async () => {
      const view = requireErpData(
        await erpApi.GET<InvoiceDetailView>("/reports/invoices/detail", {
          params: { query: { code: code! } },
        }),
      );
      return toLedgerCashInvoiceDetail(view);
    },
    enabled: Boolean(code),
    staleTime: 60_000,
  });
}
