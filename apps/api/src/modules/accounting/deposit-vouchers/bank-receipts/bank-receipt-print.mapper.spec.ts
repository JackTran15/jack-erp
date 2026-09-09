import { mapBankReceiptToVoucherPayload } from './bank-receipt-print.mapper';
import { BankReceiptEntity } from './bank-receipt.entity';
import { mapBankPaymentToVoucherPayload } from '../bank-payments/bank-payment-print.mapper';
import { BankPaymentEntity } from '../bank-payments/bank-payment.entity';
import { mapCashReceiptToVoucherPayload } from '../../cash-vouchers/cash-receipts/cash-receipt-print.mapper';
import { CashReceiptEntity } from '../../cash-vouchers/cash-receipts/cash-receipt.entity';

function receipt(overrides: Record<string, unknown> = {}): BankReceiptEntity {
  return {
    documentNumber: 'NTTK000123',
    docDate: '2026-09-08',
    partnerNameSnapshot: 'Công ty TNHH ABC',
    partnerAddressSnapshot: '12 Nguyễn Huệ, Q1',
    payerName: 'Nguyễn Văn A',
    reason: 'Thu tiền bán hàng',
    reference: 'UNC-000456',
    totalAmount: '1234567',
    lines: [{ description: 'Bán hàng', categoryId: 'cat-1', amount: '1234567' }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as BankReceiptEntity;
}

function payment(overrides: Record<string, unknown> = {}): BankPaymentEntity {
  return {
    documentNumber: 'UNC000123',
    docDate: '2026-09-08',
    partnerNameSnapshot: 'Công ty TNHH ABC',
    partnerAddressSnapshot: '12 Nguyễn Huệ, Q1',
    payeeName: 'Nguyễn Văn B',
    reason: 'Chi mua văn phòng phẩm',
    reference: 'UNC-000789',
    totalAmount: '1234567',
    lines: [{ description: 'Mua văn phòng phẩm', categoryId: 'cat-2', amount: '1234567' }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as BankPaymentEntity;
}

function cashReceipt(overrides: Record<string, unknown> = {}): CashReceiptEntity {
  return {
    documentNumber: 'PT000123',
    voucherDate: '2026-09-08',
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

describe('mapBankReceiptToVoucherPayload / mapBankPaymentToVoucherPayload', () => {
  const categoryNames = new Map([
    ['cat-1', 'Thu khác'],
    ['cat-2', 'Chi phí văn phòng'],
  ]);

  it('titles and labels a bank receipt correctly (AC-11)', () => {
    const payload = mapBankReceiptToVoucherPayload(
      receipt(),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.title).toBe('PHIẾU THU (tiền gửi)');
    expect(payload.info.find((row) => row.label === 'Người nộp tiền')?.value).toBe(
      'Công ty TNHH ABC',
    );
    expect(payload.info.find((row) => row.label === 'Người nộp')?.value).toBe('Nguyễn Văn A');
    expect(payload.signatures).toEqual([
      'Người lập phiếu',
      'Kế toán trưởng',
      'Thủ quỹ',
      'Người nộp tiền',
    ]);
  });

  it('titles and labels a bank payment correctly (AC-11)', () => {
    const payload = mapBankPaymentToVoucherPayload(
      payment(),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.title).toBe('PHIẾU CHI (tiền gửi)');
    expect(payload.info.find((row) => row.label === 'Người nhận tiền')?.value).toBe(
      'Công ty TNHH ABC',
    );
    expect(payload.info.find((row) => row.label === 'Người nhận')?.value).toBe('Nguyễn Văn B');
    expect(payload.signatures).toEqual([
      'Người lập phiếu',
      'Kế toán trưởng',
      'Thủ quỹ',
      'Người nhận tiền',
    ]);
  });

  it('shows the bank account row using the caller-resolved display name', () => {
    const payload = mapBankReceiptToVoucherPayload(
      receipt(),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === 'Tài khoản ngân hàng')?.value).toBe(
      'Vietcombank - CN1 (0011...)',
    );
  });

  it('shows the "Tham chiếu" row when the voucher carries a reference', () => {
    const payload = mapBankReceiptToVoucherPayload(
      receipt({ reference: 'UNC-000456' }),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === 'Tham chiếu')?.value).toBe('UNC-000456');
  });

  it('drops the "Tham chiếu" row entirely when the voucher has no reference', () => {
    const payload = mapBankPaymentToVoucherPayload(
      payment({ reference: null }),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === 'Tham chiếu')).toBeUndefined();
  });

  it('drops the "Địa chỉ" row entirely when partnerAddressSnapshot is empty', () => {
    const payload = mapBankReceiptToVoucherPayload(
      receipt({ partnerAddressSnapshot: null }),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === 'Địa chỉ')).toBeUndefined();
  });

  it('reads docDate rather than voucherDate for the printed date', () => {
    const payload = mapBankReceiptToVoucherPayload(
      receipt({ docDate: '2026-01-15' }),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );

    expect(payload.docDate).toBe('15 tháng 1 năm 2026');
  });

  it('reads amountInWords via the same shared util as the cash receipt mapper, byte for byte', () => {
    const bankPayload = mapBankReceiptToVoucherPayload(
      receipt({ totalAmount: '1234567' }),
      null,
      'Vietcombank - CN1 (0011...)',
      categoryNames,
    );
    const cashPayload = mapCashReceiptToVoucherPayload(
      cashReceipt({ totalAmount: '1234567' }),
      null,
      'Quỹ tiền mặt chi nhánh 1',
      categoryNames,
    );

    expect(bankPayload.amountInWords).toBe(cashPayload.amountInWords);
    expect(bankPayload.amountInWords).toBe(
      'Một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy đồng chẵn.',
    );
  });
});
