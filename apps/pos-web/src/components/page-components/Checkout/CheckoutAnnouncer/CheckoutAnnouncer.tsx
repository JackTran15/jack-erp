export interface CheckoutAnnouncerProps {
  message: string;
}

export const CheckoutAnnouncer = ({ message }: CheckoutAnnouncerProps) => (
  <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {message}
  </div>
);
