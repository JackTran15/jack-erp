import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../item.entity';
import { ResolveImageNamesHandler } from './resolve-image-names.handler';
import { ResolveImageNamesQuery } from './resolve-image-names.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const PRODUCT_A = 'aa000000-0000-4000-8000-00000000000a';
const VARIANT_A_39 = 'ab000000-0000-4000-8000-00000000003a';
const ORPHAN_B = 'ab000000-0000-4000-8000-00000000000b';
const PRODUCT_F = 'aa000000-0000-4000-8000-00000000000f';
const VARIANT_A_F = 'ab000000-0000-4000-8000-0000000000af';

// Stubbed rows for the two statements. Only codes that were bound in $2 are
// returned, the way Postgres would, so the priority logic is exercised on the
// same shape it sees in production.
const products = [
  { id: PRODUCT_A, code: 'ABC', name: 'Product A' },
  { id: PRODUCT_F, code: 'FFF', name: 'Product F' },
];
const items = [
  {
    id: VARIANT_A_39,
    code: 'ABC-DEN-39',
    name: 'A Den 39',
    productId: PRODUCT_A,
    parentCode: 'ABC',
    parentName: 'Product A',
  },
  {
    id: ORPHAN_B,
    code: 'BBB',
    name: 'Orphan B',
    productId: null,
    parentCode: null,
    parentName: null,
  },
  // A variant of A whose code collides with product F (A-09: product wins).
  {
    id: VARIANT_A_F,
    code: 'fff',
    name: 'A collides with F',
    productId: PRODUCT_A,
    parentCode: 'ABC',
    parentName: 'Product A',
  },
];

// AC-12 / AC-16 — priority, parent-product ownership for variants, DUPLICATE_SEQ
// on the second name only, input order preserved, and two SQL statements for
// any batch. Whether the SQL itself is right is proven in
// resolve-image-names.e2e-spec.ts.
describe('ResolveImageNamesHandler', () => {
  let handler: ResolveImageNamesHandler;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn((sql: string, params: [string, string[]]) => {
      const wanted = new Set(params[1]);
      if (sql.includes('FROM products')) {
        return Promise.resolve(
          products.filter((p) => wanted.has(p.code.toLowerCase())),
        );
      }
      return Promise.resolve(
        items.filter((i) => wanted.has(i.code.toLowerCase())),
      );
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResolveImageNamesHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
      ],
    }).compile();
    handler = module.get(ResolveImageNamesHandler);
  });

  const run = (names: string[]) =>
    handler.execute(new ResolveImageNamesQuery({ names }, actor));

  const productCall = () =>
    (query.mock.calls as [string, unknown[]][]).find(([sql]) =>
      sql.includes('FROM products'),
    )!;
  const itemCall = () =>
    (query.mock.calls as [string, unknown[]][]).find(([sql]) =>
      sql.includes('FROM items'),
    )!;

  it('AC-12: parses each name and matches a product code, in input order', async () => {
    const res = await run([
      'ABC (01).png',
      'ABC(2)',
      'abc (10).PNG',
      'ABC (11)',
      'ABC (00)',
      'ABC (01)',
      'XYZ',
    ]);

    expect(res.data.map((r) => r.name)).toEqual([
      'ABC (01).png',
      'ABC(2)',
      'abc (10).PNG',
      'ABC (11)',
      'ABC (00)',
      'ABC (01)',
      'XYZ',
    ]);
    expect(res.data[0]).toEqual({
      name: 'ABC (01).png',
      code: 'ABC',
      seq: 1,
      match: 'product',
      ownerId: PRODUCT_A,
      ownerCode: 'ABC',
      ownerName: 'Product A',
      error: null,
    });
    expect(res.data[1]).toMatchObject({ code: 'ABC', seq: 2, match: 'product', error: null });
    expect(res.data[2]).toMatchObject({
      code: 'abc',
      seq: 10,
      match: 'product',
      ownerId: PRODUCT_A,
      ownerCode: 'ABC',
      error: null,
    });
    expect(res.data[3]).toMatchObject({
      code: 'ABC',
      seq: 11,
      match: 'product',
      ownerId: PRODUCT_A,
      error: 'SEQ_OUT_OF_RANGE',
    });
    expect(res.data[4]).toMatchObject({ code: 'ABC', seq: 0, error: 'SEQ_OUT_OF_RANGE' });
    expect(res.data[5]).toMatchObject({
      code: 'ABC',
      seq: 1,
      match: 'product',
      ownerId: PRODUCT_A,
      error: 'DUPLICATE_SEQ',
    });
    expect(res.data[6]).toEqual({
      name: 'XYZ',
      code: 'XYZ',
      seq: null,
      match: null,
      ownerId: null,
      ownerCode: null,
      ownerName: null,
      error: null,
    });
  });

  it('scopes both statements by organization, binds distinct lower-cased codes, and never filters is_active', async () => {
    await run(['ABC (01)', 'abc (02)', 'BBB', 'Bbb.jpg', 'XYZ']);

    const [productSql, productParams] = productCall();
    const [itemSql, itemParams] = itemCall();
    expect(productParams).toEqual(['org-1', ['abc', 'bbb', 'xyz']]);
    expect(itemParams).toEqual(['org-1', ['abc', 'bbb', 'xyz']]);
    expect(productSql).toContain('organization_id = $1');
    expect(productSql).toContain('lower(code) = ANY($2::text[])');
    expect(itemSql).toContain('i.organization_id = $1');
    expect(itemSql).toContain('lower(i.code) = ANY($2::text[])');
    expect(itemSql).toContain('LEFT JOIN products p ON p.id = i.product_id');
    expect(productSql).not.toContain('is_active');
    expect(itemSql).not.toContain('is_active');
  });

  it('matches an orphan item code with the item itself as owner', async () => {
    const res = await run(['bbb (03).jpg']);
    expect(res.data[0]).toEqual({
      name: 'bbb (03).jpg',
      code: 'bbb',
      seq: 3,
      match: 'orphan',
      ownerId: ORPHAN_B,
      ownerCode: 'BBB',
      ownerName: 'Orphan B',
      error: null,
    });
  });

  it('A-03: a variant code resolves to the parent product while keeping the typed code', async () => {
    const res = await run(['abc-den-39.png']);
    expect(res.data[0]).toEqual({
      name: 'abc-den-39.png',
      code: 'abc-den-39',
      seq: null,
      match: 'variant',
      ownerId: PRODUCT_A,
      ownerCode: 'ABC',
      ownerName: 'Product A',
      error: null,
    });
  });

  it('A-09: a code that is both a product and a variant resolves to the product', async () => {
    const res = await run(['FFF (01)']);
    expect(res.data[0]).toMatchObject({
      match: 'product',
      ownerId: PRODUCT_F,
      ownerCode: 'FFF',
      ownerName: 'Product F',
    });
  });

  it('AC-16: flags DUPLICATE_SEQ on the later name only, per (ownerId, seq), across product and variant names', async () => {
    const res = await run([
      'ABC (01).png',
      'ABC (01).jpg', // same product, same seq
      'ABC (02)', // same product, other seq
      'BBB (01)', // other owner, same seq
      'ABC-DEN-39 (02)', // variant of A: owner is A, seq 2 already taken
      'ABC-DEN-39', // no seq: never a duplicate
      'ABC-DEN-39.jpg', // no seq: never a duplicate
    ]);
    expect(res.data.map((r) => r.error)).toEqual([
      null,
      'DUPLICATE_SEQ',
      null,
      null,
      'DUPLICATE_SEQ',
      null,
      null,
    ]);
    // The duplicate keeps its match so the card can still name the owner.
    expect(res.data[1]).toMatchObject({ match: 'product', ownerId: PRODUCT_A, seq: 1 });
    expect(res.data[4]).toMatchObject({ match: 'variant', ownerId: PRODUCT_A, seq: 2 });
  });

  it('does not count an out-of-range or unmatched sequence as taken', async () => {
    const res = await run(['ABC (11)', 'ABC (11)', 'XYZ (01)', 'XYZ (01)']);
    expect(res.data.map((r) => r.error)).toEqual([
      'SEQ_OUT_OF_RANGE',
      'SEQ_OUT_OF_RANGE',
      null,
      null,
    ]);
  });

  it('runs exactly two SQL statements for a 500-name batch', async () => {
    const names = Array.from({ length: 500 }, (_, i) => `CODE-${i % 50} (${(i % 10) + 1}).png`);
    const res = await run(names);
    expect(res.data).toHaveLength(500);
    expect(query).toHaveBeenCalledTimes(2);
    expect(productCall()[1]).toEqual(['org-1', expect.any(Array)]);
    expect((productCall()[1] as [string, string[]])[1]).toHaveLength(50);
  });

  it('runs no SQL when no name yields a code', async () => {
    const res = await run(['(01)', '.png']);
    expect(query).not.toHaveBeenCalled();
    expect(res.data).toEqual([
      { name: '(01)', code: '', seq: 1, match: null, ownerId: null, ownerCode: null, ownerName: null, error: null },
      { name: '.png', code: '', seq: null, match: null, ownerId: null, ownerCode: null, ownerName: null, error: null },
    ]);
  });
});
