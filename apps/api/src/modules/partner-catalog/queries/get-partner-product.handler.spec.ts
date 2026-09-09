import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
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

  const run = async (rows: object[], productId = 'p1') => {
    query = jest.fn().mockResolvedValue(rows);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GetPartnerProductHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    return moduleRef
      .get(GetPartnerProductHandler)
      .execute(new GetPartnerProductQuery(productId, actor));
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
    await expect(run([])).rejects.toThrow('Product not found');
  });

  it('does not name the id in the not-found message', async () => {
    await expect(run([], 'secret-id-1234')).rejects.toThrow(
      /^Product not found$/,
    );
  });

  // AC-17 — the organization predicate must be in the query, not applied after.
  it('scopes by organization inside the WHERE clause', async () => {
    await run(ROWS);
    expect(sql()).toContain('p.organization_id = $1');
    expect(sql()).toContain('i.organization_id = $1');
    expect(query.mock.calls[0]![1]).toEqual(['org-1', 'p1', ['branch-1', 'branch-2']]);
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
