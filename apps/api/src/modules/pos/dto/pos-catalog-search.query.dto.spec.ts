import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  POS_CATALOG_SEARCH_MAX_LIMIT,
  PosCatalogSearchMode,
  PosCatalogSearchQueryDto,
  PosCatalogSearchView,
} from './pos-catalog-search.query.dto';

// Mirrors the global pipe registered in main.ts, so what passes here is what
// passes in production.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const meta: ArgumentMetadata = {
  type: 'query',
  metatype: PosCatalogSearchQueryDto,
};

const run = (value: Record<string, unknown>) =>
  pipe.transform(value, meta) as Promise<PosCatalogSearchQueryDto>;

describe('PosCatalogSearchQueryDto', () => {
  it('accepts a bare term and leaves the optional knobs undefined', async () => {
    const dto = await run({ q: '235' });

    expect(dto.q).toBe('235');
    expect(dto.mode).toBeUndefined();
    expect(dto.view).toBeUndefined();
    expect(dto.limit).toBeUndefined();
  });

  it('trims the term before checking it is non-empty', async () => {
    const dto = await run({ q: '  235  ' });
    expect(dto.q).toBe('235');

    await expect(run({ q: '   ' })).rejects.toThrow();
  });

  it('rejects a missing or empty term', async () => {
    await expect(run({})).rejects.toThrow();
    await expect(run({ q: '' })).rejects.toThrow();
  });

  it('coerces limit from its query-string form', async () => {
    const dto = await run({ q: '235', limit: '50' });
    expect(dto.limit).toBe(50);
  });

  it('accepts a limit above the ceiling — the handler clamps it', async () => {
    // Clamping rather than rejecting is the decision in ADR-02: a dropdown that
    // 400s on a mistyped number is worse than one that returns 100 rows.
    const dto = await run({ q: '235', limit: String(POS_CATALOG_SEARCH_MAX_LIMIT * 50) });
    expect(dto.limit).toBe(POS_CATALOG_SEARCH_MAX_LIMIT * 50);
  });

  it('rejects a non-numeric or zero limit', async () => {
    await expect(run({ q: '235', limit: 'abc' })).rejects.toThrow();
    await expect(run({ q: '235', limit: '0' })).rejects.toThrow();
  });

  it('accepts the declared modes and views and rejects anything else', async () => {
    await expect(run({ q: 'x', mode: PosCatalogSearchMode.EXACT })).resolves.toBeDefined();
    await expect(run({ q: 'x', view: PosCatalogSearchView.SUGGEST })).resolves.toBeDefined();
    await expect(run({ q: 'x', mode: 'bogus' })).rejects.toThrow();
    await expect(run({ q: 'x', view: 'bogus' })).rejects.toThrow();
  });

  it('reads includeUntracked from its query-string spellings', async () => {
    expect((await run({ q: 'x', includeUntracked: 'true' })).includeUntracked).toBe(true);
    expect((await run({ q: 'x', includeUntracked: '1' })).includeUntracked).toBe(true);
    expect((await run({ q: 'x', includeUntracked: 'false' })).includeUntracked).toBe(false);
  });

  it('rejects an undeclared query parameter', async () => {
    // forbidNonWhitelisted is on globally, so a typo'd param must not be
    // silently ignored.
    await expect(run({ q: 'x', direction: 'showroom' })).rejects.toThrow();
  });
});
