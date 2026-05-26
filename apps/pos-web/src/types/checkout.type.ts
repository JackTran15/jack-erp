/** Checkout mode per open invoice tab (Zustand session). String values for JSON persist. */
export enum CheckoutVariantEnum {
  SALE = "sale",
  QUICK_EXCHANGE = "quick_exchange",
  INVOICE_RETURN = "invoice_return",
}

/** Lý do build payload checkout thất bại — caller toast và abort. */
export type ResolveCheckoutPayloadError = {
  code: "missing_payment_account";
};
