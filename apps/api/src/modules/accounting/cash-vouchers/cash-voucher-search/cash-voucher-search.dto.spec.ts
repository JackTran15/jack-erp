import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CashVoucherDocumentType,
  CashVoucherSearchDto,
} from './cash-voucher-search.dto';

describe('CashVoucherSearchDto', () => {
  it('accepts the unified cash voucher filters', async () => {
    const dto = plainToInstance(CashVoucherSearchDto, {
      page: 2,
      limit: 25,
      cashAccountId: '11111111-1111-4111-8111-111111111111',
      voucherDate: { from: '2026-01-01', to: '2026-01-31' },
      documentNumber: { operator: '*', value: 'PT' },
      documentType: { value: CashVoucherDocumentType.GOODS_RECEIPT_PAYMENT },
      totalAmount: { operator: '>=', value: 1000 },
      counterparty: { operator: '*', value: 'Acme' },
      reason: { operator: '!', value: 'cancelled' },
    });

    expect(await validate(dto)).toEqual([]);
  });

  it('rejects unsupported document types', async () => {
    const dto = plainToInstance(CashVoucherSearchDto, {
      documentType: { value: 'bank_transfer' },
    });

    expect(await validate(dto)).not.toEqual([]);
  });
});
