import { formatVnd } from "@erp/ui";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { useInvoiceDetailQuery } from "@erp/pos/hooks/react-query/use-query-invoice";
import { formatDiscountLabel } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { INVOICE_PAYMENT_METHOD_LABEL } from "@erp/pos/constants/checkout.constant";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import { getInvoiceSignedTotal } from "@erp/pos/lib/common/invoiceAmount";
import { InvoiceStatusBadge } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/InvoiceReceiptDialog/InvoiceStatusBadge/InvoiceStatusBadge";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { InvoiceType } from "@erp/pos/types/invoice.type";

const INVOICE_TITLE_BY_TYPE: Record<InvoiceType, string> = {
  SALE: "Hóa đơn thanh toán",
  RETURN: "Hóa đơn đổi trả",
  EXCHANGE: "Hóa đơn đổi hàng",
};

export interface InvoiceReceiptDialogProps {
  open: boolean;
  /** Hóa đơn cần xem; null = chưa chọn (dialog đóng). */
  invoiceId: string | null;
  onClose: () => void;
  customerName?: string;
  customerPhone?: string | null;
}

interface SummaryLine {
  label: string;
  value: number;
  bold?: boolean;
  /** Hiển thị thay cho định dạng VND (vd điểm tích: "+95") khi value không phải tiền. */
  valueText?: string;
}

function buildPaymentLines(invoice: InvoiceRow): SummaryLine[] {
  const lines: SummaryLine[] = [
    { label: "Tổng thanh toán", value: getInvoiceSignedTotal(invoice), bold: true },
  ];
  if (invoice.discountAmount > 0) {
    lines.push({ label: "Giảm giá", value: invoice.discountAmount });
  }
  // Chi tiết thanh toán theo từng phương thức (Tiền mặt / Chuyển khoản / Thẻ);
  // fallback về `paymentMethod` đơn lẻ cho hoá đơn cũ chưa có mảng `payments`.
  const payments = invoice.payments ?? [];
  if (payments.length > 0) {
    for (const p of payments) {
      lines.push({
        label: INVOICE_PAYMENT_METHOD_LABEL[p.paymentMethod],
        value: Number(p.amount) || 0,
      });
    }
  } else if (invoice.paymentMethod) {
    lines.push({
      label: INVOICE_PAYMENT_METHOD_LABEL[invoice.paymentMethod],
      value: invoice.amountDue,
    });
  }
  if (invoice.depositAmount > 0) {
    lines.push({ label: "Đặt cọc", value: invoice.depositAmount });
  }
  if (invoice.remainingDebt != null && invoice.remainingDebt > 0) {
    lines.push({ label: "Công nợ", value: invoice.remainingDebt });
  }
  if (invoice.pointsRedeemed != null && invoice.pointsRedeemed > 0) {
    lines.push({
      label: `Điểm thanh toán (${invoice.pointsRedeemed})`,
      value: Number(invoice.pointsDiscountAmount) || 0,
    });
  }
  if (invoice.pointsEarned != null && invoice.pointsEarned > 0) {
    lines.push({
      label: "Điểm được tích",
      value: 0,
      valueText: `+${invoice.pointsEarned}`,
    });
  }
  if (invoice.pointsReversed != null && invoice.pointsReversed > 0) {
    lines.push({
      label: "Điểm trừ",
      value: 0,
      valueText: `-${invoice.pointsReversed}`,
    });
  }
  return lines;
}

/**
 * Biên lai chi tiết hóa đơn — mở từ tab "Lịch sử mua hàng" khi click số hóa đơn.
 * Dùng `PosDialog` làm nền (theo cách hiện tại); dựng nội dung biên lai theo
 * `InvoiceDetails.md`. Dữ liệu lấy từ `GET /invoices/:id` (kèm items + thanh toán).
 */
export function InvoiceReceiptDialog({
  open,
  invoiceId,
  onClose,
  customerName,
  customerPhone,
}: InvoiceReceiptDialogProps) {
  const {
    data: invoice,
    isLoading,
    isError,
  } = useInvoiceDetailQuery(open ? (invoiceId ?? undefined) : undefined);

  const items = invoice?.items ?? [];
  const customerLabel = customerName
    ? `${customerName}${customerPhone ? ` (${customerPhone})` : ""}`
    : "—";

  return (
    <PosDialog open={open} onClose={onClose} width={660}>
      {invoice ? (
        <>
          <header className="flex flex-col items-center gap-1 px-8 pb-5 pt-8 text-center">
            <h2 className="text-[20px] font-bold leading-tight text-[#1F2937]">
              {invoice.type
                ? INVOICE_TITLE_BY_TYPE[invoice.type]
                : INVOICE_TITLE_BY_TYPE.SALE}
            </h2>
            <p className="text-[14px] text-[#6B7280]">Số: {invoice.code}</p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-8">
            <div className="mb-5 grid grid-cols-[110px_1fr_auto] items-start gap-x-4 gap-y-2">
              <span className="text-[14px] font-semibold text-[#1F2937]">
                Ngày:
              </span>
              <span className="text-[14px] text-[#1F2937]">
                {formatViDateTime(invoice.issuedAt ?? invoice.createdAt, {
                  separator: "space",
                })}
              </span>
              <span className="row-span-3 justify-self-end self-start">
                <InvoiceStatusBadge status={invoice.status} />
              </span>

              <span className="text-[14px] font-semibold text-[#1F2937]">
                Thu ngân:
              </span>
              <span className="text-[14px] text-[#1F2937]">—</span>

              <span className="text-[14px] font-semibold text-[#1F2937]">
                Khách hàng:
              </span>
              <span className="text-[14px] text-[#1F2937]">{customerLabel}</span>
            </div>

            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-[#F3F4F6] text-[13px] font-semibold text-[#1F2937]">
                  <th className="px-3 py-2">Tên hàng hóa</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2 text-right">SL</th>
                  <th className="px-3 py-2 text-right">Đơn giá</th>
                  <th className="px-3 py-2 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="text-[14px] text-[#1F2937]">
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-[13px] text-gray-400"
                    >
                      Không có hàng hóa
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const isReturn = it.direction === "IN";
                    return (
                    <tr key={it.id} className="align-top">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <span>{it.itemName}</span>
                          {isReturn ? (
                            <span className="rounded bg-[#FEE2E2] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#E5403A]">
                              Trả lại
                            </span>
                          ) : null}
                        </div>
                        {it.itemCode ? (
                          <div className="text-[12px] text-[#9CA3AF]">
                            {it.itemCode}
                          </div>
                        ) : null}
                        {it.lineDiscountType ? (
                          <div className="text-[12px] italic text-[#E5403A]">
                            {formatDiscountLabel({
                              type: it.lineDiscountType,
                              value: Number(it.lineDiscountValue) || 0,
                              amount: Number(it.lineDiscount) || 0,
                              reason: it.lineDiscountReason ?? "",
                            })}
                          </div>
                        ) : null}
                        {it.note ? (
                          <div className="text-[12px] italic text-[#6B7280]">
                            Ghi chú:{" "}
                            <span className="text-[#9CA3AF]">{it.note}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">{it.unit}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {it.quantity}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatVnd(it.unitPrice)}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums${
                          isReturn ? " text-[#E5403A]" : ""
                        }`}
                      >
                        {(() => {
                          const gross =
                            Number(it.unitPrice) * Number(it.quantity);
                          const finalTotal = Number(it.lineTotal);
                          // Dòng có KM: gạch giá gốc, hiển thị giá sau giảm bên dưới.
                          if (
                            !isReturn &&
                            Number(it.lineDiscount) > 0 &&
                            gross > finalTotal
                          ) {
                            return (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="text-[12px] text-[#9CA3AF] line-through">
                                  {formatVnd(gross)}
                                </span>
                                <span>{formatVnd(finalTotal)}</span>
                              </div>
                            );
                          }
                          return formatVnd(
                            isReturn ? -Math.abs(finalTotal) : finalTotal,
                          );
                        })()}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div className="my-5 border-t border-dashed border-[#E5E7EB]" />

            <div className="grid grid-cols-2 gap-8 pb-2">
              <div className="flex items-start justify-between">
                <span className="text-[14px] font-semibold text-[#1F2937]">
                  Thành tiền
                </span>
                <span className="text-[14px] font-semibold tabular-nums text-[#1F2937]">
                  {formatVnd(invoice.subtotal)}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {buildPaymentLines(invoice).map((line) => (
                  <div
                    key={line.label}
                    className="flex items-center justify-between text-[14px] text-[#1F2937]"
                  >
                    <span className={line.bold ? "font-semibold" : undefined}>
                      {line.label}
                    </span>
                    <span
                      className={
                        line.bold
                          ? "font-semibold tabular-nums"
                          : "tabular-nums"
                      }
                    >
                      {line.valueText ?? formatVnd(line.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 py-16 text-[14px] text-gray-500">
          {isError
            ? "Không tải được hóa đơn."
            : isLoading
              ? "Đang tải…"
              : ""}
        </div>
      )}

      <footer className="flex justify-end px-8 py-5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-8 text-[14px] font-medium text-[#1F2937] transition-colors hover:border-[#D1D5DB] hover:bg-[#F9FAFB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2"
        >
          Đóng
        </button>
      </footer>
    </PosDialog>
  );
}
