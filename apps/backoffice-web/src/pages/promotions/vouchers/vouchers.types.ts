/** Trạng thái theo dõi thẻ voucher. */
export type VoucherStatus = "TRACKING" | "STOPPED";

/** Một dòng trong danh sách thẻ voucher. */
export interface VoucherRow {
  id: string;
  /** Nhà phát hành. */
  issuer: string;
  /** Mã / tên voucher. */
  code: string;
  /** ISO date yyyy-MM-dd; có thể trống. */
  startDate?: string;
  /** ISO date yyyy-MM-dd; có thể trống. */
  endDate?: string;
  description?: string;
  /** Mệnh giá (VND). */
  faceValue: number;
  /** Tổng số lượng. */
  totalQuantity: number;
  /** Tổng giá trị voucher (VND). */
  totalVoucherValue: number;
  /** Tổng giá trị áp dụng (VND). */
  totalAppliedValue: number;
  status: VoucherStatus;
}
