import { MembershipTier } from './membership-card.entity';

/** Default tier auto-issued when a new customer is created without an explicit card. */
export const DEFAULT_NEW_CUSTOMER_MEMBERSHIP_TIER = MembershipTier.SILVER;

export function generateMembershipCardNumber(organizationId: string): string {
  return `MC${organizationId.slice(0, 2).toUpperCase()}${String(Date.now()).slice(-6)}`;
}
