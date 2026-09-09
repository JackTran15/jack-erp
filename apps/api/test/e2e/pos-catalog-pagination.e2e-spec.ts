import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * Pagination moved out of a JS pass over the whole org catalogue and into SQL.
 * The unit tests pin which query the service builds; what only a real database
 * can settle is whether that query returns the same cards, in the same order,
 * as the code it replaced.
 *
 * The fixture is deliberately small but adversarial about ordering: every name
 * below is a pair that en_US.utf8 and Vietnamese sort differently (Ao/Áo/Ăn/Âm,
 * D/Đ, E/Ế). A plain `ORDER BY name` disagreed with the previous
 * `localeCompare(name, 'vi')` at 2,198 of 2,539 positions on a production
 * restore, so this is the assertion that would have caught it. See ADR-02.
 */
describe('POS catalogue pagination (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  // Ordered as Vietnamese orders them, so the expectations read plainly.
  const NAMES = [
    'Ao mua',
    'Áo thun',
    'Ăn vặt',
    'Âm ly',
    'Dép tổ ong',
    'Đầm dạ hội',
    'Em bé',
    'Ế hàng',
    'Giày nam',
  ];

  const listUrl = (params: Record<string, string | number>) =>
    `/pos/branches/${seed.branchId}/catalog/products?` +
    new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
    );

  const list = async (params: Record<string, string | number>) => {
    const res = await request(app.getHttpServer())
      .get(listUrl(params))
      .set('Authorization', authHeader(seed.accessToken))
      .expect(200);
    return res.body as {
      data: { id: string; name: string; quantityOnHand: number }[];
      total: number;
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // Two of the nine cards are parent products with variants; the rest are
    // standalone items. Both arms of the UNION therefore carry real rows, and
    // the interleaving of the two is what the ORDER BY has to get right.
    for (const [index, name] of NAMES.entries()) {
      const isProduct = index === 1 || index === 5;
      let productId: string | null = null;
      if (isProduct) {
        const inserted = await ds.query(
          `INSERT INTO products (organization_id, created_by, name)
           VALUES ($1, $2, $3) RETURNING id`,
          [seed.organizationId, seed.userId, name],
        );
        productId = inserted[0].id;
      }
      const variants = isProduct ? 2 : 1;
      for (let v = 0; v < variants; v += 1) {
        await ds.query(
          `INSERT INTO items
             (organization_id, created_by, code, name, unit, selling_price,
              purchase_price, is_active, is_pos_visible, product_id, variant_label)
           VALUES ($1, $2, $3, $4, 'Cái', $5, 0, true, true, $6, $7)`,
          [
            seed.organizationId,
            seed.userId,
            `C-${index}-${v}`,
            isProduct ? `${name} (${v})` : name,
            100 + index * 10 + v,
            productId,
            isProduct ? String(v) : null,
          ],
        );
      }
    }
  }, 420_000);

  afterAll(async () => {
    await app.close();
  });

  describe('ordering', () => {
    it('matches localeCompare(name, "vi") across the whole catalogue', async () => {
      const { data, total } = await list({ page: 1, pageSize: 100 });

      expect(total).toBe(NAMES.length);
      const expected = [...NAMES].sort((a, b) => a.localeCompare(b, 'vi'));
      expect(data.map((c) => c.name)).toEqual(expected);
    });

    it('reverses cleanly on sortOrder=desc', async () => {
      const { data } = await list({
        page: 1,
        pageSize: 100,
        sortOrder: 'desc',
      });

      const expected = [...NAMES].sort((a, b) => b.localeCompare(a, 'vi'));
      expect(data.map((c) => c.name)).toEqual(expected);
    });

    it('keeps the same order across page boundaries', async () => {
      const first = await list({ page: 1, pageSize: 4 });
      const second = await list({ page: 2, pageSize: 4 });
      const third = await list({ page: 3, pageSize: 4 });

      expect(first.data).toHaveLength(4);
      expect(second.data).toHaveLength(4);
      expect(third.data).toHaveLength(1);

      const paged = [...first.data, ...second.data, ...third.data].map(
        (c) => c.name,
      );
      expect(paged).toEqual([...NAMES].sort((a, b) => a.localeCompare(b, 'vi')));
      // Every card exactly once: an unstable ORDER BY would duplicate or drop.
      expect(new Set(paged).size).toBe(NAMES.length);
    });

    it('reports a total that ignores the page window', async () => {
      const { total } = await list({ page: 2, pageSize: 4 });

      expect(total).toBe(NAMES.length);
    });

    it('returns an empty page past the end without failing', async () => {
      const { data, total } = await list({ page: 99, pageSize: 4 });

      expect(data).toEqual([]);
      expect(total).toBe(NAMES.length);
    });
  });

  describe('fast and slow paths agree', () => {
    it('reports the same cards and quantities whichever sort chose the page', async () => {
      const byName = await list({ page: 1, pageSize: 100 });
      const byStock = await list({
        page: 1,
        pageSize: 100,
        sortBy: 'quantityOnHand',
      });

      // sortBy=quantityOnHand takes a different path through the service
      // (ADR-03), so the two must be compared as sets, not sequences.
      expect(byStock.total).toBe(byName.total);
      const quantities = (rows: { id: string; quantityOnHand: number }[]) =>
        Object.fromEntries(rows.map((c) => [c.id, c.quantityOnHand]));
      expect(quantities(byStock.data)).toEqual(quantities(byName.data));
    });

    it('sorts by price without disturbing the card set', async () => {
      const byName = await list({ page: 1, pageSize: 100 });
      const byPrice = await list({
        page: 1,
        pageSize: 100,
        sortBy: 'minPrice',
      });

      expect(byPrice.data.map((c) => c.id).sort()).toEqual(
        byName.data.map((c) => c.id).sort(),
      );
    });
  });

  describe('filters', () => {
    it('narrows to the cards a search term matches', async () => {
      const { data, total } = await list({
        page: 1,
        pageSize: 100,
        search: 'Đầm',
      });

      expect(total).toBe(1);
      expect(data[0].name).toBe('Đầm dạ hội');
    });

    it('matches a variant code, not just the card name', async () => {
      const { data, total } = await list({
        page: 1,
        pageSize: 100,
        search: 'C-4-0',
      });

      expect(total).toBe(1);
      expect(data[0].name).toBe('Dép tổ ong');
    });

    it('returns nothing rather than everything when a term matches no card', async () => {
      const { data, total } = await list({
        page: 1,
        pageSize: 100,
        search: 'khong-co-gi-khop',
      });

      expect(data).toEqual([]);
      expect(total).toBe(0);
    });
  });

  describe('card shape', () => {
    it('groups a product’s variants into one card and leaves items alone', async () => {
      const { data } = await list({ page: 1, pageSize: 100 });
      const byName = Object.fromEntries(data.map((c) => [c.name, c]));

      expect(byName['Áo thun']).toMatchObject({
        kind: 'PRODUCT',
        variantCount: 2,
        imageUrl: null,
      });
      expect(byName['Ao mua']).toMatchObject({
        kind: 'ITEM',
        variantCount: 1,
      });
    });

    it('spans a product card’s price range across its variants', async () => {
      const { data } = await list({ page: 1, pageSize: 100 });
      const card = data.find((c) => c.name === 'Áo thun') as unknown as {
        minPrice: number;
        maxPrice: number;
      };

      // Áo thun is index 1, so its variants are priced 110 and 111.
      expect(card.minPrice).toBe(110);
      expect(card.maxPrice).toBe(111);
    });

    it('reports a card with no stock as 0 rather than omitting it', async () => {
      const { data } = await list({ page: 1, pageSize: 100 });

      expect(data).toHaveLength(NAMES.length);
      expect(data.every((c) => c.quantityOnHand === 0)).toBe(true);
    });
  });
});
