/**
 * Response của `GET /organizations/current/pos-settings` — cấu hình POS cấp tổ
 * chức. `defaultCreditDays` dùng để prefill modal "Hạn thanh toán"; `null` = chưa đặt.
 */
export interface PosSettingsResponse {
  defaultCreditDays: number | null;
}
