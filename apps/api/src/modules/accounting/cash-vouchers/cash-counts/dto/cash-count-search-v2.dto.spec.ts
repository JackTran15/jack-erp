import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StringOperator } from '../../../../../common/filters/filter.dto';
import { CashCountSearchV2Dto } from './cash-count-search-v2.dto';

describe('CashCountSearchV2Dto', () => {
  it('accepts the supported dynamic-search filters', async () => {
    const dto = plainToInstance(CashCountSearchV2Dto, {
      page: 2,
      limit: 50,
      cashAccountId: '7ea10a42-151a-4cf8-8970-31e613f08fb0',
      countedAt: { from: '2026-06-01T00:00:00.000Z' },
      documentNumber: { operator: StringOperator.CONTAINS, value: 'KKQ' },
      purpose: { operator: StringOperator.CONTAINS, value: 'cuối ngày' },
      status: { value: 'POSTED' },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an invalid cashAccountId', async () => {
    const dto = plainToInstance(CashCountSearchV2Dto, {
      cashAccountId: 'not-a-uuid',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'cashAccountId')).toBe(true);
  });
});
