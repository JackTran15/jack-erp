import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import type {
  InvoiceInfoData,
  InvoiceTotals,
} from "@erp/pos/interfaces/invoice-printing.interface";
import type {
  SampleDerivedTotals,
  SampleInvoiceDraft,
} from "@erp/pos/interfaces/print-sample-invoice.interface";
import type {
  SampleNumberFieldKey,
  SampleTextFieldKey,
} from "@erp/pos/types/print-sample-invoice.type";

/** Dòng giảm trừ vào "Tổng thanh toán" khi đang bật. */
const DISCOUNT_KEYS: readonly SampleNumberFieldKey[] = [
  "totals.itemDiscountTotal",
  "totals.invoiceDiscountTotal",
  "totals.voucherDiscount",
];

/** Dòng phí cộng vào "Tổng thanh toán" khi đang bật. */
const FEE_KEYS: readonly SampleNumberFieldKey[] = [
  "totals.deliveryFee",
  "totals.returnFee",
  "totals.vatAmount",
];

/** Giá trị của một field số — 0 khi field đang tắt (không tính vào tổng). */
function activeNumber(
  draft: SampleInvoiceDraft,
  key: SampleNumberFieldKey,
): number {
  return draft.enabled[key] ? draft.numbers[key] : 0;
}

function sum(
  draft: SampleInvoiceDraft,
  keys: readonly SampleNumberFieldKey[],
): number {
  return keys.reduce((total, key) => total + activeNumber(draft, key), 0);
}

/**
 * Bộ số tự tính từ hàng hóa + thanh toán. Người dùng ghi đè được từng ô
 * (`draft.overrides`) để dựng các tình huống số bất thường khi căn máy in.
 */
export function deriveSampleTotals(
  draft: SampleInvoiceDraft,
): SampleDerivedTotals {
  const totalQty = draft.lines.reduce((s, l) => s + Math.abs(l.qty), 0);
  const subtotal = draft.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const grandTotal = subtotal - sum(draft, DISCOUNT_KEYS) + sum(draft, FEE_KEYS);
  const paid = draft.payments.reduce((s, p) => s + p.amount, 0);

  const auto: SampleDerivedTotals = {
    "totals.totalQty": totalQty,
    "totals.subtotal": subtotal,
    "totals.grandTotal": grandTotal,
    "totals.paid": paid,
    "totals.change": paid - grandTotal,
  };

  // Ghi đè áp SAU khi tính chuỗi: ghi đè "Tổng thanh toán" thì "Trả lại khách"
  // tự chạy theo con số ghi đè đó, trừ khi nó cũng bị ghi đè.
  const grand = draft.overrides["totals.grandTotal"] ?? auto["totals.grandTotal"];
  const paidFinal = draft.overrides["totals.paid"] ?? auto["totals.paid"];

  return {
    "totals.totalQty":
      draft.overrides["totals.totalQty"] ?? auto["totals.totalQty"],
    "totals.subtotal":
      draft.overrides["totals.subtotal"] ?? auto["totals.subtotal"],
    "totals.grandTotal": grand,
    "totals.paid": paidFinal,
    "totals.change": draft.overrides["totals.change"] ?? paidFinal - grand,
  };
}

/** Chuỗi của field text, `undefined` khi tắt hoặc rỗng (renderer ẩn dòng). */
function text(
  draft: SampleInvoiceDraft,
  key: SampleTextFieldKey,
): string | undefined {
  if (!draft.enabled[key]) return undefined;
  return draft.texts[key].trim() || undefined;
}

/**
 * Dựng `InvoicePayload` từ draft. Field tắt thì KHÔNG có mặt trong object —
 * đúng quy ước ẩn dòng sẵn có của `renderInvoiceHtml` (`amountRow` ẩn khi
 * `amount == null`, nên `0` vẫn in; `infoRow` ẩn khi chuỗi rỗng).
 */
export function buildPayloadFromDraft(
  draft: SampleInvoiceDraft,
  copies: number,
): InvoicePayload {
  const derived = deriveSampleTotals(draft);

  const info: InvoiceInfoData = {
    returnForInvoiceRef: text(draft, "info.returnForInvoiceRef"),
    customerName: text(draft, "info.customerName"),
    customerPhone: text(draft, "info.customerPhone"),
    cashierName: text(draft, "info.cashierName"),
    salespersonName: text(draft, "info.salespersonName"),
    deliveryDate: text(draft, "info.deliveryDate"),
    deliveryAddress: text(draft, "info.deliveryAddress"),
    note: text(draft, "info.note"),
  };

  // Bắt đầu từ 5 dòng bắt buộc (đã tự tính), rồi chèn thêm dòng nào đang bật.
  const totals: InvoiceTotals = {
    totalQty: derived["totals.totalQty"],
    subtotal: derived["totals.subtotal"],
    grandTotal: derived["totals.grandTotal"],
    paid: derived["totals.paid"],
    change: derived["totals.change"],
  };
  for (const key of Object.keys(draft.numbers) as SampleNumberFieldKey[]) {
    if (!draft.enabled[key]) continue;
    const field = key.slice("totals.".length) as keyof InvoiceTotals;
    if (field in totals) continue; // 5 dòng tự tính ở trên đã chốt
    totals[field] = draft.numbers[key];
  }

  return {
    store: {
      name: draft.texts["store.name"].trim(),
      address: text(draft, "store.address") ?? "",
      phone: text(draft, "store.phone") ?? "",
    },
    invoiceNumber: draft.texts.invoiceNumber.trim(),
    issuedAt: new Date(draft.texts.issuedAt),
    info,
    voucherCode: text(draft, "voucherCode"),
    // STT đánh lại theo vị trí hiện tại — thêm/xóa dòng không làm lệch cột "#".
    lines: draft.lines.map((line, index) => ({
      index: index + 1,
      name: line.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal ?? undefined,
      discountLabel: line.discountLabel.trim() || undefined,
      note: line.note.trim() || undefined,
    })),
    totals,
    payments: draft.payments.map((p) => ({ label: p.label, amount: p.amount })),
    provisional: draft.docType === "PROVISIONAL",
    isReturnExchange: draft.docType === "RETURN_EXCHANGE",
    copies: Math.max(1, Math.floor(copies)),
    policy: {
      title: text(draft, "policy.title") ?? "",
      body: text(draft, "policy.body") ?? "",
    },
    closingMessage: draft.texts.closingMessage.trim(),
    provisionalNote: text(draft, "provisionalNote"),
  };
}
