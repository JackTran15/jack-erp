import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';

import {
  POS_CATALOG_STOCK_MAX_ITEMS,
  PosCatalogStockQueryDto,
} from './pos-catalog-stock.dto';

// Mirrors the global pipe in main.ts, so what passes here passes in production.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const meta: ArgumentMetadata = {
  type: 'body',
  metatype: PosCatalogStockQueryDto,
};

const uuid = (n: number) =>
  `0000000${n}-0000-4000-8000-000000000001`.slice(-36);

const run = (value: Record<string, unknown>) =>
  pipe.transform(value, meta) as Promise<PosCatalogStockQueryDto>;

describe('PosCatalogStockQueryDto', () => {
  it('accepts a list of uuids', async () => {
    const itemIds = [uuid(1), uuid(2), uuid(3)];
    const dto = await run({ itemIds });
    expect(dto.itemIds).toEqual(itemIds);
  });

  it('rejects an empty list', async () => {
    // The client is expected to skip the request rather than ask about nothing;
    // an empty body reaching here means the caller is broken, and 200-with-[]
    // would hide that.
    await expect(run({ itemIds: [] })).rejects.toThrow();
  });

  it('rejects a missing list', async () => {
    await expect(run({})).rejects.toThrow();
  });

  it('rejects anything that is not a uuid', async () => {
    await expect(run({ itemIds: [uuid(1), 'not-a-uuid'] })).rejects.toThrow();
  });

  it('rejects a list above the ceiling', async () => {
    const tooMany = Array.from({ length: POS_CATALOG_STOCK_MAX_ITEMS + 1 }, () =>
      uuid(1),
    );
    await expect(run({ itemIds: tooMany })).rejects.toThrow();
  });

  it('accepts a list exactly at the ceiling', async () => {
    const atCap = Array.from({ length: POS_CATALOG_STOCK_MAX_ITEMS }, () =>
      uuid(1),
    );
    await expect(run({ itemIds: atCap })).resolves.toBeDefined();
  });

  it('rejects an undeclared field', async () => {
    await expect(run({ itemIds: [uuid(1)], branchId: 'x' })).rejects.toThrow();
  });
});
