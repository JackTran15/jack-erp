import { DocumentBranchInfo, VoucherKind, VoucherPrintPayload } from '@erp/shared-interfaces';
import { mapCashReceiptToVoucherPayload } from '../cash-receipts/cash-receipt-print.mapper';
import { CashReceiptEntity } from '../cash-receipts/cash-receipt.entity';
import { mapCashPaymentToVoucherPayload } from '../cash-payments/cash-payment-print.mapper';
import { CashPaymentEntity } from '../cash-payments/cash-payment.entity';
import { mapBankReceiptToVoucherPayload } from '../../deposit-vouchers/bank-receipts/bank-receipt-print.mapper';
import { BankReceiptEntity } from '../../deposit-vouchers/bank-receipts/bank-receipt.entity';
import { mapBankPaymentToVoucherPayload } from '../../deposit-vouchers/bank-payments/bank-payment-print.mapper';
import { BankPaymentEntity } from '../../deposit-vouchers/bank-payments/bank-payment.entity';

/**
 * Runs the same fixture shape through all four treasury print mappers so the
 * five invariants they share (paper size, title, doc-date wording, signature
 * count, no blank info rows) can never drift apart without this suite noticing
 * (T-03-05). T-03-01 and T-03-02 already cover each mapper's own label rules.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TreasuryMapper = (entity: any, branch: DocumentBranchInfo | null, accountName: string, categoryNames: Map<string, string>) => VoucherPrintPayload;

interface Row {
  kind: VoucherKind;
  label: string;
  mapper: TreasuryMapper;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fixture: (overrides?: Record<string, unknown>) => any;
  expectedTitle: string;
  expectedPartyLabel: string;
}

function cashReceiptFixture(overrides: Record<string, unknown> = {}): CashReceiptEntity {
  return {
    documentNumber: 'PT000123',
    voucherDate: '2026-09-08',
    partnerId: 'partner-1',
    partnerNameSnapshot: 'Công ty TNHH ABC',
    partnerAddressSnapshot: '12 Nguyễn Huệ, Q1',
    payerName: 'Nguyễn Văn A',
    reason: 'Thu tiền bán hàng',
    totalAmount: '1234567',
    lines: [{ description: 'Bán hàng', categoryId: 'cat-1', amount: '1234567' }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as CashReceiptEntity;
}

function cashPaymentFixture(overrides: Record<string, unknown> = {}): CashPaymentEntity {
  return {
    documentNumber: 'PC000123',
    voucherDate: '2026-09-08',
    partnerId: 'partner-1',
    partnerNameSnapshot: 'Công ty TNHH ABC',
    partnerAddressSnapshot: '12 Nguyễn Huệ, Q1',
    payeeName: 'Nguyễn Văn B',
    reason: 'Chi mua văn phòng phẩm',
    totalAmount: '1234567',
    lines: [{ description: 'Mua văn phòng phẩm', categoryId: 'cat-2', amount: '1234567' }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as CashPaymentEntity;
}

function bankReceiptFixture(overrides: Record<string, unknown> = {}): BankReceiptEntity {
  return {
    documentNumber: 'NTG000123',
    docDate: '2026-09-08',
    partnerId: 'partner-1',
    partnerNameSnapshot: 'Công ty TNHH ABC',
    partnerAddressSnapshot: '12 Nguyễn Huệ, Q1',
    payerName: 'Nguyễn Văn A',
    reason: 'Thu tiền gửi',
    reference: 'REF-001',
    totalAmount: '1234567',
    lines: [{ description: 'Thu tiền gửi', categoryId: 'cat-1', amount: '1234567' }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as BankReceiptEntity;
}

function bankPaymentFixture(overrides: Record<string, unknown> = {}): BankPaymentEntity {
  return {
    documentNumber: 'UNC000123',
    docDate: '2026-09-08',
    partnerId: 'partner-1',
    partnerNameSnapshot: 'Công ty TNHH ABC',
    partnerAddressSnapshot: '12 Nguyễn Huệ, Q1',
    payeeName: 'Nguyễn Văn B',
    reason: 'Chi tiền gửi',
    reference: 'REF-002',
    totalAmount: '1234567',
    lines: [{ description: 'Chi tiền gửi', categoryId: 'cat-2', amount: '1234567' }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as BankPaymentEntity;
}

const ROWS: Row[] = [
  {
    kind: VoucherKind.CASH_RECEIPT,
    label: 'cash receipt',
    mapper: mapCashReceiptToVoucherPayload,
    fixture: cashReceiptFixture,
    expectedTitle: 'PHIẾU THU',
    expectedPartyLabel: 'Người nộp tiền',
  },
  {
    kind: VoucherKind.CASH_PAYMENT,
    label: 'cash payment',
    mapper: mapCashPaymentToVoucherPayload,
    fixture: cashPaymentFixture,
    expectedTitle: 'PHIẾU CHI',
    expectedPartyLabel: 'Người nhận tiền',
  },
  {
    kind: VoucherKind.BANK_RECEIPT,
    label: 'bank receipt',
    mapper: mapBankReceiptToVoucherPayload,
    fixture: bankReceiptFixture,
    expectedTitle: 'PHIẾU THU (tiền gửi)',
    expectedPartyLabel: 'Người nộp tiền',
  },
  {
    kind: VoucherKind.BANK_PAYMENT,
    label: 'bank payment',
    mapper: mapBankPaymentToVoucherPayload,
    fixture: bankPaymentFixture,
    expectedTitle: 'PHIẾU CHI (tiền gửi)',
    expectedPartyLabel: 'Người nhận tiền',
  },
];

const categoryNames = new Map([
  ['cat-1', 'Thu khác'],
  ['cat-2', 'Chi phí văn phòng'],
]);

const ACCOUNT_NAME = 'Quỹ/Tài khoản kiểm thử';

describe.each(ROWS)('$label print payload — shared treasury invariants', ({ mapper, fixture, expectedTitle, expectedPartyLabel }) => {
  it('prints on A5 paper', () => {
    const payload = mapper(fixture(), null, ACCOUNT_NAME, categoryNames);
    expect(payload.paper).toBe('A5');
  });

  it('titles the document without embedding the document number (voucher-payload.ts:34-35)', () => {
    const payload = mapper(fixture(), null, ACCOUNT_NAME, categoryNames);
    expect(payload.title).toBe(expectedTitle);
    expect(payload.title.includes(payload.docNo)).toBe(false);
  });

  it('renders docDate without the leading "Ngày" word', () => {
    const payload = mapper(fixture(), null, ACCOUNT_NAME, categoryNames);
    expect(payload.docDate.startsWith('Ngày')).toBe(false);
  });

  it('carries exactly 4 signature slots', () => {
    const payload = mapper(fixture(), null, ACCOUNT_NAME, categoryNames);
    expect(payload.signatures).toHaveLength(4);
  });

  it('never emits an info row with an empty value', () => {
    const payload = mapper(fixture(), null, ACCOUNT_NAME, categoryNames);
    expect(payload.info.every((row) => row.value.trim().length > 0)).toBe(true);
  });

  it('shows both the free-text name and address for a walk-in party (AC-12)', () => {
    const payload = mapper(
      fixture({
        partnerId: null,
        partnerNameSnapshot: 'Anh Ba (khách vãng lai)',
        partnerAddressSnapshot: '45 Lê Lợi',
      }),
      null,
      ACCOUNT_NAME,
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === expectedPartyLabel)?.value).toBe(
      'Anh Ba (khách vãng lai)',
    );
    expect(payload.info.find((row) => row.label === 'Địa chỉ')?.value).toBe('45 Lê Lợi');
  });

  it('drops the "Địa chỉ" row entirely when partnerAddressSnapshot is empty', () => {
    const payload = mapper(fixture({ partnerAddressSnapshot: null }), null, ACCOUNT_NAME, categoryNames);
    expect(payload.info.find((row) => row.label === 'Địa chỉ')).toBeUndefined();
  });
});

describe('amountInWords parity across all four treasury kinds', () => {
  it('reads the same amount identically, proving there is no second number-reading implementation', () => {
    const words = ROWS.map(
      ({ mapper, fixture }) => mapper(fixture({ totalAmount: '1234567' }), null, ACCOUNT_NAME, categoryNames).amountInWords,
    );

    expect(new Set(words).size).toBe(1);
    expect(words[0]).toBe('Một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy đồng chẵn.');
  });
});
