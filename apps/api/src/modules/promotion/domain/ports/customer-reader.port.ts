export const CUSTOMER_READER = Symbol('CUSTOMER_READER');

export interface CustomerView {
  groupId?: string;
  birthDate?: Date;
  /** From the customer's membership_cards; undefined when they hold no card. */
  cardTierId?: string;
}

export interface CustomerReaderPort {
  /** Returns null when the customer does not exist (or belongs to a different org) — never throws. */
  load(orgId: string, customerId: string): Promise<CustomerView | null>;
}
