/**
 * Loyalty point monetary rates — single source of truth for both directions.
 *
 * Earning and redemption are symmetric by current business rule, but kept as
 * two constants so they can diverge without hunting down magic numbers.
 */

/** VND of invoice subtotal that earns 1 point (1.000đ spent → 1 point). */
export const POINT_EARN_VND_PER_POINT = 1000;

/** VND discount granted per point redeemed (1 point → 1.000đ off). */
export const POINT_REDEMPTION_VALUE_VND = 1000;
