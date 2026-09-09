import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  DEFAULT_PARTNER_PRODUCT_SORT,
  PartnerProductSearchDto,
} from './partner-product-search.dto';

// Mirrors the global pipe in main.ts: whitelist + forbidNonWhitelisted + transform.
const parse = (body: object) => {
  const dto = plainToInstance(PartnerProductSearchDto, body, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors };
};
const propsWithErrors = (body: object) =>
  parse(body).errors.map((e) => e.property);

describe('PartnerProductSearchDto', () => {
  it('accepts an empty body and applies the documented defaults', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sort).toBe(DEFAULT_PARTNER_PRODUCT_SORT);
    expect(dto.sort).toBe('newest');
  });

  // AC-14
  it('rejects a field that is not part of the contract', () => {
    expect(propsWithErrors({ notAField: true })).toContain('notAField');
  });

  it('rejects limit above 100 and accepts exactly 100', () => {
    expect(propsWithErrors({ limit: 500 })).toContain('limit');
    expect(propsWithErrors({ limit: 101 })).toContain('limit');
    expect(propsWithErrors({ limit: 100 })).toHaveLength(0);
  });

  it('rejects a non-positive page', () => {
    expect(propsWithErrors({ page: 0 })).toContain('page');
    expect(propsWithErrors({ page: -1 })).toContain('page');
  });

  it('accepts the three published sort modes', () => {
    for (const sort of ['newest', 'price_asc', 'price_desc']) {
      expect(propsWithErrors({ sort })).toHaveLength(0);
    }
  });

  // A-04: popular was removed from the contract, so it must fail loudly rather
  // than fall through to a default order the partner cannot see.
  it('rejects sort=popular', () => {
    expect(propsWithErrors({ sort: 'popular' })).toContain('sort');
  });

  it('rejects an unknown sort value', () => {
    expect(propsWithErrors({ sort: 'random' })).toContain('sort');
  });

  it('rejects a categoryId that is not a uuid', () => {
    expect(propsWithErrors({ categoryId: 'giay-nu' })).toContain('categoryId');
    expect(
      propsWithErrors({ categoryId: 'e1000000-0000-4000-8000-000000000001' }),
    ).toHaveLength(0);
  });

  it('rejects a negative price bound', () => {
    expect(propsWithErrors({ priceFrom: -1 })).toContain('priceFrom');
    expect(propsWithErrors({ priceTo: -1 })).toContain('priceTo');
  });

  it('accepts colours and sizes as string arrays', () => {
    expect(
      propsWithErrors({ colors: ['BA', 'D'], sizes: ['38', '39'] }),
    ).toHaveLength(0);
  });

  it('rejects non-string entries inside colours', () => {
    expect(propsWithErrors({ colors: [1, 2] })).toContain('colors');
  });

  it('caps how many facet values one request may carry', () => {
    const many = Array.from({ length: 51 }, (_, i) => String(i));
    expect(propsWithErrors({ sizes: many })).toContain('sizes');
  });

  it('does not accept an internal filter-operator object', () => {
    // The internal surfaces take { operator, value }; the partner contract is
    // deliberately a bare value, and mixing the two must not silently pass.
    expect(
      propsWithErrors({ keyword: { operator: '*', value: 'giay' } }),
    ).toContain('keyword');
  });
});
