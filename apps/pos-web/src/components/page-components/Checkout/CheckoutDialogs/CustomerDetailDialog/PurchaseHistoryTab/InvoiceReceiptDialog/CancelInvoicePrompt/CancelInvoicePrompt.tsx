export interface CancelInvoicePromptProps {
  invoiceCode: string;
  reason: string;
  onReasonChange: (value: string) => void;
  /** Message lỗi nguyên văn từ API; null = chưa lỗi. */
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * Lớp xác nhận hủy hóa đơn, phủ lên chính biên lai (dialog trong dialog sẽ
 * tranh focus-trap của Radix nên dùng overlay `absolute` trong `DialogContent`).
 */
export const CancelInvoicePrompt = ({
  invoiceCode,
  reason,
  onReasonChange,
  error,
  submitting,
  onSubmit,
  onClose,
}: CancelInvoicePromptProps) => {
  const canSubmit = !submitting && reason.trim().length > 0;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 px-8">
      <div className="w-full max-w-[420px] rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-[16px] font-semibold text-[#1F2937]">
          Hủy hóa đơn {invoiceCode}
        </h3>
        <p className="mt-2 text-[13px] text-gray-500">
          Tiền đã thu sẽ được hoàn về đúng quỹ và hàng được cộng lại kho showroom.
        </p>

        <label className="mt-4 block text-[13px] font-medium text-[#1F2937]">
          Lý do hủy
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC]"
            placeholder="Ví dụ: khách đổi ý"
          />
        </label>

        {error ? (
          <p className="mt-3 text-[13px] text-[#B91C1C]">{error}</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-5 text-[14px] font-medium text-[#1F2937] hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#B91C1C] px-5 text-[14px] font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
          >
            {submitting ? "Đang hủy…" : "Xác nhận hủy"}
          </button>
        </div>
      </div>
    </div>
  );
};
