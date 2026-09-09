import { mapCashReceiptToVoucherPayload } from './cash-receipt-print.mapper';
import { CashReceiptEntity } from './cash-receipt.entity';
import { mapCashPaymentToVoucherPayload } from '../cash-payments/cash-payment-print.mapper';
import { CashPaymentEntity } from '../cash-payments/cash-payment.entity';

function receipt(overrides: Record<string, unknown> = {}): CashReceiptEntity {
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

function payment(overrides: Record<string, unknown> = {}): CashPaymentEntity {
  return {
    documentNumber: 'PC000123',
    voucherDate: '2026-09-08',
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

describe('mapCashReceiptToVoucherPayload / mapCashPaymentToVoucherPayload', () => {
  const categoryNames = new Map([
    ['cat-1', 'Thu khác'],
    ['cat-2', 'Chi phí văn phòng'],
  ]);

  it('titles and labels a cash receipt correctly (AC-11)', () => {
    const payload = mapCashReceiptToVoucherPayload(receipt(), null, 'Quỹ tiền mặt chi nhánh 1', categoryNames);

    expect(payload.title).toBe('PHIẾU THU');
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

  it('titles and labels a cash payment correctly (AC-11)', () => {
    const payload = mapCashPaymentToVoucherPayload(payment(), null, 'Quỹ tiền mặt chi nhánh 1', categoryNames);

    expect(payload.title).toBe('PHIẾU CHI');
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

  it('shows both the hand-typed name and address for a free-text party (AC-12)', () => {
    const payload = mapCashPaymentToVoucherPayload(
      payment({ partnerNameSnapshot: 'Anh Ba (khách vãng lai)', partnerAddressSnapshot: '45 Lê Lợi' }),
      null,
      'Quỹ tiền mặt chi nhánh 1',
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === 'Người nhận tiền')?.value).toBe(
      'Anh Ba (khách vãng lai)',
    );
    expect(payload.info.find((row) => row.label === 'Địa chỉ')?.value).toBe('45 Lê Lợi');
  });

  it('drops the "Địa chỉ" row entirely when partnerAddressSnapshot is empty', () => {
    const payload = mapCashReceiptToVoucherPayload(
      receipt({ partnerAddressSnapshot: null }),
      null,
      'Quỹ tiền mặt chi nhánh 1',
      categoryNames,
    );

    expect(payload.info.find((row) => row.label === 'Địa chỉ')).toBeUndefined();
  });

  it('reads the amount in words using the shared util, thousand-grouped', () => {
    const payload = mapCashReceiptToVoucherPayload(
      receipt({ totalAmount: '1234567' }),
      null,
      'Quỹ tiền mặt chi nhánh 1',
      categoryNames,
    );

    expect(payload.amountInWords).toBe(
      'Một triệu hai trăm ba mươi bốn nghìn năm trăm sáu mươi bảy đồng chẵn.',
    );
  });

  it('reads the amount in words using the shared util, with "linh"', () => {
    const payload = mapCashReceiptToVoucherPayload(
      receipt({ totalAmount: '1000005' }),
      null,
      'Quỹ tiền mặt chi nhánh 1',
      categoryNames,
    );

    expect(payload.amountInWords).toBe('Một triệu không trăm lẻ năm đồng chẵn.');
  });
});
