import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GoodsIssueLineDto } from '../goods-issue.controller';

/**
 * A goods-issue line's unit price is now the cost that reaches the stock ledger
 * (ADR-01), so the sign guard on it stopped being cosmetic: a negative price
 * would add value to inventory while removing stock. The rule itself lives in
 * `@Min(0)` on the DTO and is enforced by the global ValidationPipe — these
 * tests pin it there, because nothing in the service re-checks it.
 */
const failedFields = (payload: object): string[] =>
  validateSync(plainToInstance(GoodsIssueLineDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);

const line = (overrides: Record<string, unknown> = {}) => ({
  itemId: '11111111-1111-4111-8111-111111111111',
  quantity: 30,
  ...overrides,
});

describe('GoodsIssueLineDto — unitPrice guard (AC-04)', () => {
  it('rejects a negative unit price', () => {
    expect(failedFields(line({ unitPrice: -1 }))).toContain('unitPrice');
  });

  it('accepts a positive unit price — the user-entered cost basis', () => {
    expect(failedFields(line({ unitPrice: 350000 }))).toEqual([]);
  });

  it('accepts 0, which means "no opinion" and falls back to the moving average', () => {
    expect(failedFields(line({ unitPrice: 0 }))).toEqual([]);
  });

  it('accepts an omitted unit price, same meaning as 0', () => {
    expect(failedFields(line())).toEqual([]);
  });
});
