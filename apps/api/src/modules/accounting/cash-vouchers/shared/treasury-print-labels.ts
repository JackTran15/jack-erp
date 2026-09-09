import { VoucherKind } from '@erp/shared-interfaces';

/** The four treasury voucher kinds this table covers — everything but the three stock kinds of `VoucherKind`. */
export type TreasuryVoucherKind =
  | VoucherKind.CASH_RECEIPT
  | VoucherKind.CASH_PAYMENT
  | VoucherKind.BANK_RECEIPT
  | VoucherKind.BANK_PAYMENT;

/**
 * The four strings that differ between a receipt and a payment voucher (ADR-05).
 * A single table so the four print mappers (cash x2 now, bank x2 in T-03-02)
 * can never drift from each other on wording.
 */
export interface TreasuryPrintLabels {
  /** Printed document title, e.g. "PHIẾU THU". */
  title: string;
  /**
   * Label of the counterparty row in `info`, per AC-11: "Người nộp tiền" on a
   * receipt, "Người nhận tiền" on a payment.
   */
  partyLabel: string;
  /** Label of the payer/payee-name row in `info` — the short form of `partyLabel`. */
  personLabel: string;
  /** Last entry of `signatures` — same wording as `partyLabel`. */
  lastSignature: string;
}

/**
 * Keyed by `VoucherKind` so a mapper looks up its own labels with no branching.
 * Bank entries are filled in ahead of T-03-02 (which is the first to consume
 * them) so this table stays the one place all four kinds' wording is decided.
 */
export const TREASURY_PRINT_LABELS: Record<TreasuryVoucherKind, TreasuryPrintLabels> = {
  [VoucherKind.CASH_RECEIPT]: {
    title: 'PHIẾU THU',
    partyLabel: 'Người nộp tiền',
    personLabel: 'Người nộp',
    lastSignature: 'Người nộp tiền',
  },
  [VoucherKind.CASH_PAYMENT]: {
    title: 'PHIẾU CHI',
    partyLabel: 'Người nhận tiền',
    personLabel: 'Người nhận',
    lastSignature: 'Người nhận tiền',
  },
  [VoucherKind.BANK_RECEIPT]: {
    title: 'PHIẾU THU (tiền gửi)',
    partyLabel: 'Người nộp tiền',
    personLabel: 'Người nộp',
    lastSignature: 'Người nộp tiền',
  },
  [VoucherKind.BANK_PAYMENT]: {
    title: 'PHIẾU CHI (tiền gửi)',
    partyLabel: 'Người nhận tiền',
    personLabel: 'Người nhận',
    lastSignature: 'Người nhận tiền',
  },
};
