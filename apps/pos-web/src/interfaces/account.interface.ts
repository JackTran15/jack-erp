import type { ApiPaymentMethod } from "@erp/pos/types/invoice.type";

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  parentAccountId?: string | null;
  isActive: boolean;
}

/**
 * Một tài khoản nhận tiền đã cấu hình (bảng `payment_accounts` ở BE), trả về từ
 * `GET /payment-accounts`. Thu ngân chọn dòng này khi thanh toán; FE gửi `id`
 * (paymentAccountId) — BE tự suy ra COA account, FE không đụng tới COA id.
 */
export interface PaymentAccountRow {
  id: string;
  paymentMethod: ApiPaymentMethod;
  /** Tên quỹ tiền gửi đã liên kết — null với tiền mặt. */
  depositAccountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string | null;
  label: string | null;
  sortOrder: number;
}
