/**
 * Loyalty point monetary rates — single source of truth for both directions.
 *
 * Earning and redemption are NOT symmetric: a sale earns 1 point per 10.000đ of
 * subtotal (10% of value ÷ 1.000), and each point redeems for 500đ — a net ~5%
 * cashback. Kept as two constants so the earn/reverse path and the redemption
 * path each reference the rate they need instead of repeating a magic number.
 */

/** VND of invoice subtotal that earns 1 point (10.000đ spent → 1 point; 10% of value ÷ 1.000). */
export const POINT_EARN_VND_PER_POINT = 10000;

/** VND discount granted per point redeemed (1 point → 500đ off). */
export const POINT_REDEMPTION_VALUE_VND = 500;
