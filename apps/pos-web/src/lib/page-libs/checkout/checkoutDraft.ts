import {
  createPaymentLine,
  type PaymentLine,
} from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import type {
  CheckoutDraft,
  CheckoutPaymentDraft,
} from "@erp/pos/interfaces/checkout.interface";
import type { CashSuggestion } from "@erp/pos/interfaces/checkout.interface";

/**
 * State soạn thảo per-tab mặc định cho 1 hóa đơn mới. Đây là nguồn sự thật duy
 * nhất cho mọi chỗ khởi tạo draft (tạo tab mới, reset sau thanh toán, backfill
 * khi hydrate / migrate persisted state).
 */
export function initialCheckoutDraft(): CheckoutDraft {
  return {
    customer: {
      selectedCustomer: null,
      customerQuery: "",
    },
    payment: {
      paymentLines: [createPaymentLine(PaymentMethodEnum.CASH)],
      keepChange: false,
      debt: false,
      note: "",
      printInvoice: true,
      preorder: false,
      selectedSuggestionId: null,
      deposit: 0,
      returnFee: 0,
      paymentDueDate: null,
      creditDays: null,
    },
    promotion: {
      appliedPromotion: null,
      pointsRedeemed: 0,
      appliedVoucher: null,
    },
    labels: {
      selectedLabelIds: [],
    },
    meta: {
      selectedSalesperson: null,
      selectedPriceBook: null,
    },
    catalog: {
      toolbar: { query: "", qty: 1, splitLine: false },
      catalogQuery: "",
      catalogGroup: undefined,
      catalogCollapsed: false,
    },
  };
}

/**
 * Backfill 1 draft từ dữ liệu persisted/cũ. Session lưu từ phiên bản trước chưa
 * có `draft` → trả về `initialCheckoutDraft()`. Draft hình dạng thiếu (do version
 * trung gian) → lấp đầy field còn trống. Idempotent.
 */
export function ensureDraftShape(maybe: unknown): CheckoutDraft {
  const base = initialCheckoutDraft();
  if (!maybe || typeof maybe !== "object") return base;
  const d = maybe as Partial<CheckoutDraft>;
  const persistedLines = d.payment?.paymentLines;
  return {
    customer: { ...base.customer, ...(d.customer ?? {}) },
    payment: {
      ...base.payment,
      ...(d.payment ?? {}),
      paymentLines:
        Array.isArray(persistedLines) && persistedLines.length > 0
          ? persistedLines.map((l) => ({ ...l }))
          : base.payment.paymentLines,
    },
    promotion: { ...base.promotion, ...(d.promotion ?? {}) },
    labels: {
      ...base.labels,
      ...(d.labels ?? {}),
      selectedLabelIds: Array.isArray(d.labels?.selectedLabelIds)
        ? [...d.labels.selectedLabelIds]
        : base.labels.selectedLabelIds,
    },
    meta: { ...base.meta, ...(d.meta ?? {}) },
    catalog: {
      ...base.catalog,
      ...(d.catalog ?? {}),
      toolbar: { ...base.catalog.toolbar, ...(d.catalog?.toolbar ?? {}) },
    },
  };
}

// ---------------------------------------------------------------------------
// Pure transforms cho slice payment (giữ đúng ngữ nghĩa của payment store cũ).
// Trả về Partial để action gọi `set(prev => ({ ...prev, ...partial }))`.
// ---------------------------------------------------------------------------

/**
 * Áp danh sách dòng thanh toán mới. Số tiền nhân viên gõ tay chỉ giữ tới khi
 * tổng (settlementAbs) đổi lần kế — `computeFirstLineAuto` sẽ ghi đè lại.
 */
export function computeChangedPaymentLines(
  _prev: CheckoutPaymentDraft,
  next: PaymentLine[],
): Partial<CheckoutPaymentDraft> {
  return {
    paymentLines: next,
    selectedSuggestionId: null,
  };
}

/** Áp gợi ý tiền mặt vào dòng CASH (tạo mới nếu chưa có) + ngừng auto-fill. */
export function computePickSuggestionLines(
  prev: CheckoutPaymentDraft,
  suggestion: CashSuggestion,
): Partial<CheckoutPaymentDraft> {
  const cashIdx = prev.paymentLines.findIndex(
    (l) => l.method === PaymentMethodEnum.CASH,
  );
  const nextLines: PaymentLine[] =
    cashIdx === -1
      ? [
          createPaymentLine(PaymentMethodEnum.CASH, suggestion.amount),
          ...prev.paymentLines,
        ]
      : prev.paymentLines.map((l, i) =>
          i === cashIdx ? { ...l, amount: suggestion.amount } : l,
        );
  return {
    selectedSuggestionId: suggestion.id,
    paymentLines: nextLines,
  };
}

/**
 * Tự điền số tiền dòng đầu = `amount` khi chỉ có đúng 1 dòng thanh toán (dòng đầu
 * luôn bám theo "Còn phải thu"). Trả về `{}` (no-op) khi có ≥2 dòng (split payment)
 * hoặc số tiền không đổi.
 */
export function computeFirstLineAuto(
  prev: CheckoutPaymentDraft,
  amount: number,
): Partial<CheckoutPaymentDraft> {
  if (prev.paymentLines.length !== 1) return {};
  const first = prev.paymentLines[0]!;
  if (first.amount === amount) return {};
  return {
    paymentLines: [{ ...first, amount }],
    selectedSuggestionId: null,
  };
}
