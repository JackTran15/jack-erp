import type { MembershipTierEnum } from "@erp/pos/types/customer.type";

/**
 * Thẻ thành viên trả về từ `GET /customers/:id/membership-card`. Mỗi khách
 * có tối đa 1 thẻ active. BE trả 404 khi khách chưa có thẻ → service map về
 * `null` để UI hiển thị empty state.
 */
export interface MembershipCard {
  id: string;
  customerId: string;
  cardNumber: string;
  tier: MembershipTierEnum;
  /** Điểm khả dụng tại thời điểm đọc. */
  points: number;
  /** ISO date-time UTC — ngày phát hành. */
  issuedAt: string;
  /** ISO date-time UTC — hạn dùng (optional). */
  expiresAt?: string;
  isActive: boolean;
}
