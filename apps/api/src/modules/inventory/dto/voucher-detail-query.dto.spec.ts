import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { VoucherDetailQueryDto } from './voucher-detail-query.dto';

/**
 * Query params arrive as strings, so the transform is the whole contract here.
 * The case that matters most is the last one: a typo like `?includeLines=flase`
 * must be rejected, not silently read as "false" and quietly strip the lines
 * from a response the caller expected them in.
 */
describe('VoucherDetailQueryDto', () => {
  const parse = (raw: Record<string, unknown>) => {
    const dto = plainToInstance(VoucherDetailQueryDto, raw);
    return { dto, errors: validateSync(dto) };
  };

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('reads %p as %p', (raw, expected) => {
    const { dto, errors } = parse({ includeLines: raw });
    expect(errors).toHaveLength(0);
    expect(dto.includeLines).toBe(expected);
  });

  it('leaves the flag undefined when the param is absent, so the service default wins', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto.includeLines).toBeUndefined();
  });

  it('rejects a value that is neither boolean-ish nor empty', () => {
    const { errors } = parse({ includeLines: 'flase' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('includeLines');
  });
});
