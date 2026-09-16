import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { MediaQueryService, PublicMedia } from '../../media/media-query.service';
import { GetPartnerProductHandler } from './get-partner-product.handler';
import { GetPartnerProductQuery } from './get-partner-product.query';

const actor: ActorContext = {
  userId: 'partner-shadow-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1', 'branch-2'],
  roles: [],
};

const base = {
  id: 'p1',
  code: 'MY88610',
  name: 'Giày búp bê MY88610',
  description: 'Da bò thật',
  categoryId: 'c1',
  categoryName: 'Giày nữ',
};

// Flat join rows: one per (variant, attribute) pair, exactly as SQL returns.
const row = (
  itemId: string,
  itemCode: string,
  price: number,
  inStock: boolean,
  attrName: string | null,
  attrValue: string | null,
  variantLabel: string | null = null,
) => ({
  ...base,
  itemId,
  itemCode,
  variantLabel,
  price,
  inStock,
  attrName,
  attrValue,
});

const ROWS = [
  row('i1', 'MY-38', 750000, true, 'Size', '38', '38 · BA'),
  row('i1', 'MY-38', 750000, true, 'Color', 'BA', '38 · BA'),
  row('i2', 'MY-39', 495000, false, 'Size', '39', '39 · D'),
  row('i2', 'MY-39', 495000, false, 'Color', 'D', '39 · D'),
];

describe('GetPartnerProductHandler', () => {
  let query: jest.Mock;
  let resolvePublicUrls: jest.Mock;

  const run = async (
    rows: object[],
    productCode = 'MY88610',
    media: Map<string, PublicMedia[]> = new Map(),
  ) => {
    query = jest.fn().mockResolvedValue(rows);
    resolvePublicUrls = jest.fn().mockResolvedValue(media);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GetPartnerProductHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: MediaQueryService,
          useValue: { resolvePublicUrls },
        },
      ],
    }).compile();
    return moduleRef
      .get(GetPartnerProductHandler)
      .execute(new GetPartnerProductQuery(productCode, actor));
  };

  const sql = () => query.mock.calls[0]![0] as string;

  // AC-15
  it('folds the flat join into attributes and variants', async () => {
    const res = await run(ROWS);

    expect(res.id).toBe('p1');
    expect(res.description).toBe('Da bò thật');
    expect(res.variants).toHaveLength(2);
    expect(res.variants[0]).toEqual({
      id: 'i1',
      code: 'MY-38',
      variantLabel: '38 · BA',
      price: 750000,
      inStock: true,
      attributes: { Size: '38', Color: 'BA' },
    });
    expect(res.attributes).toEqual([
      { name: 'Size', options: ['38', '39'] },
      { name: 'Color', options: ['BA', 'D'] },
    ]);
  });

  it('derives the price range and stock flag from the variants', async () => {
    const res = await run(ROWS);
    expect(res.priceMin).toBe(495000);
    expect(res.priceMax).toBe(750000);
    // One variant in stock is enough for the product to be in stock.
    expect(res.inStock).toBe(true);
  });

  it('reports out of stock only when no variant has any', async () => {
    const res = await run(ROWS.map((r) => ({ ...r, inStock: false })));
    expect(res.inStock).toBe(false);
  });

  it('maps colours and sizes onto the shared row fields', async () => {
    const res = await run(ROWS);
    expect(res.colors).toEqual(['BA', 'D']);
    expect(res.sizes).toEqual(['38', '39']);
    expect(res.images).toEqual([]);
  });

  // AC-06 — URL ordering itself is covered by `buildDetail`'s own tests
  // (dto/partner-product-detail.dto.spec.ts); this is just the handler's wiring.
  it('asks MediaQueryService for this product id, scoped to the actor org', async () => {
    await run(ROWS);
    expect(resolvePublicUrls).toHaveBeenCalledWith(['p1'], 'org-1');
  });

  it('projects PublicMedia entries to URL strings only, in order', async () => {
    const media = new Map<string, PublicMedia[]>([
      [
        'p1',
        [
          { id: 'm1', url: 'https://cdn.example.com/erp-media-public/org/o1/product/p1/a.jpg', fileName: 'front.jpg' },
          { id: 'm2', url: 'https://cdn.example.com/erp-media-public/org/o1/product/p1/b.jpg', fileName: 'back.jpg' },
        ],
      ],
    ]);
    const res = await run(ROWS, 'MY88610', media);
    expect(res.images).toEqual([
      'https://cdn.example.com/erp-media-public/org/o1/product/p1/a.jpg',
      'https://cdn.example.com/erp-media-public/org/o1/product/p1/b.jpg',
    ]);
    expect(JSON.stringify(res.images)).not.toContain('fileName');
    expect(JSON.stringify(res.images)).not.toContain('m1');
  });

  // media_objects.owner_id is uuid; Postgres always returns it lowercase, so
  // the media lookup must key off the row the DB returned, not the request id.
  it('resolves images by the database id casing, not the request casing', async () => {
    const media = new Map<string, PublicMedia[]>([
      ['p1', [{ id: 'm1', url: 'https://cdn.example.com/erp-media-public/org/o1/product/p1/a.jpg', fileName: 'a.jpg' }]],
    ]);
    const res = await run(ROWS, 'my88610', media);
    expect(resolvePublicUrls).toHaveBeenCalledWith(['p1'], 'org-1');
    expect(res.images).toEqual([
      'https://cdn.example.com/erp-media-public/org/o1/product/p1/a.jpg',
    ]);
  });

  it('recognises Vietnamese dimension names too', async () => {
    const vi = [
      row('i1', 'MY-38', 750000, true, 'Màu sắc', 'BA'),
      row('i1', 'MY-38', 750000, true, 'Kích thước', '38'),
    ];
    const res = await run(vi);
    expect(res.colors).toEqual(['BA']);
    expect(res.sizes).toEqual(['38']);
  });

  it('handles a variant with no attributes at all', async () => {
    const res = await run([row('i1', 'PLAIN', 100000, true, null, null)]);
    expect(res.variants).toHaveLength(1);
    expect(res.variants[0]!.attributes).toEqual({});
    expect(res.attributes).toEqual([]);
    expect(res.colors).toEqual([]);
  });

  // AC-16 / AC-17 / AC-18 — all three are the same zero-row outcome.
  it('throws the identical 404 for missing, foreign and retired products', async () => {
    await expect(run([])).rejects.toBeInstanceOf(NotFoundException);
    expect(resolvePublicUrls).not.toHaveBeenCalled();
    await expect(run([])).rejects.toThrow('Product not found');
    expect(resolvePublicUrls).not.toHaveBeenCalled();
  });

  it('does not name the code in the not-found message', async () => {
    await expect(run([], 'secret-code-1234')).rejects.toThrow(
      /^Product not found$/,
    );
    expect(resolvePublicUrls).not.toHaveBeenCalled();
  });

  // AC-25 — the queried code is what reaches the database and what comes back.
  it('looks up and returns the code that was queried', async () => {
    const rows = ROWS.map((r) => ({ ...r, code: 'TN398' }));
    const res = await run(rows, 'TN398');
    expect(query.mock.calls[0]![1][1]).toBe('TN398');
    expect(res.code).toBe('TN398');
  });

  // AC-25 — the lookup key is products.code, exact match, not products.id.
  it('filters on p.code with an exact match, never p.id', async () => {
    await run(ROWS);
    expect(sql()).toContain('p.code = $2');
    expect(sql()).not.toContain('p.id = $2');
    // $2 is bound exactly once: no `OR i.code = $2` or cast fallback.
    expect(sql().match(/\$2\b/g)).toHaveLength(1);
    expect(sql()).not.toMatch(/lower\(\s*p\.code/i);
    expect(sql()).not.toMatch(/p\.code\s+ilike/i);
  });

  // AC-17 — the organization predicate must be in the query, not applied after.
  it('scopes by organization inside the WHERE clause', async () => {
    await run(ROWS);
    expect(sql()).toContain('p.organization_id = $1');
    expect(sql()).toContain('i.organization_id = $1');
    expect(query.mock.calls[0]![1]).toEqual([
      'org-1',
      'MY88610',
      ['branch-1', 'branch-2'],
    ]);
  });

  // AC-18
  it('only joins active variants', async () => {
    await run(ROWS);
    expect(sql()).toContain('i.is_active = true');
    expect(sql()).toContain('p.is_active = true');
  });

  it('casts the price so it is a number, not a string', async () => {
    await run(ROWS);
    expect(sql()).toContain('i.selling_price::float');
  });

  it('never selects a purchase price', async () => {
    await run(ROWS);
    expect(sql()).not.toContain('purchase_price');
  });

  it('scopes stock to the branches the credential may see', async () => {
    await run(ROWS);
    expect(sql()).toContain('stock_balances sb');
    expect(sql()).toContain('sb.branch_id = ANY($3::varchar[])');
  });
});
