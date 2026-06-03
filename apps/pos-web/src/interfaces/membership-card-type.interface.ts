import type { MembershipTierEnum } from "@erp/pos/types/customer.type";

/**
 * Loại thẻ thành viên trả về từ `GET /customers/membership-card-types`.
 * Được quản lý trong DB theo tổ chức.
 */
export interface MembershipCardType {
  id: string;
  name: string;
  tier: MembershipTierEnum;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}
