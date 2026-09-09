import { PartnerProductSort } from './dto/partner-product-search.dto';
import { resolveProductOrderBy } from './partner-product-sort';

describe('resolveProductOrderBy', () => {
  // AC-10
  it('orders newest first by product creation date', () => {
    expect(resolveProductOrderBy('newest')).toBe('a.created_at DESC, a.id ASC');
  });

  it('orders ascending on the cheapest variant', () => {
    expect(resolveProductOrderBy('price_asc')).toBe('a."priceMin" ASC, a.id ASC');
  });

  it('orders descending on the dearest variant', () => {
    expect(resolveProductOrderBy('price_desc')).toBe('a."priceMax" DESC, a.id ASC');
  });

  it('falls back to newest when sort is not supplied', () => {
    expect(resolveProductOrderBy(undefined)).toBe(resolveProductOrderBy('newest'));
  });

  // Paging is unstable without a unique tiebreak: equal-priced products can
  // swap between page 1 and page 2, duplicating one row and hiding another.
  it('always ends with a unique tiebreak', () => {
    for (const sort of ['newest', 'price_asc', 'price_desc'] as PartnerProductSort[]) {
      expect(resolveProductOrderBy(sort)).toMatch(/a\.id ASC$/);
    }
  });

  it('throws on a value outside the published contract', () => {
    expect(() => resolveProductOrderBy('popular' as PartnerProductSort)).toThrow(
      /Unsupported partner product sort/,
    );
  });

  it('never returns caller-supplied text', () => {
    // Proves the clause comes from the table, not from the input.
    expect(() =>
      resolveProductOrderBy("name; DROP TABLE items --" as PartnerProductSort),
    ).toThrow();
  });
});
