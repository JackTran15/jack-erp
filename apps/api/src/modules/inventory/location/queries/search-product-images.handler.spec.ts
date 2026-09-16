import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { MediaQueryService } from '../../../media/media-query.service';
import { ItemEntity } from '../item.entity';
import { ProductImageStatusFilter } from '../dto/product-image-search.dto';
import { buildCombinedCte } from './search-inventory-items-v2.handler';
import { SearchProductImagesHandler } from './search-product-images.handler';
import { SearchProductImagesQuery } from './search-product-images.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const PRODUCT_ID = 'aa000000-0000-4000-8000-000000000001';
const ORPHAN_ID = 'ab000000-0000-4000-8000-000000000001';

// The predicates run in SQL, so the unit test pins the statement construction:
// the shared CTE is embedded verbatim, each imageStatus emits exactly its
// predicate, count and data share one WHERE, and the page's ids go to
// resolvePublicUrls exactly once. Whether the predicates are semantically
// right is proven in product-image-search.e2e-spec.ts.
describe('SearchProductImagesHandler', () => {
  let handler: SearchProductImagesHandler;
  let query: jest.Mock;
  let resolvePublicUrls: jest.Mock;

  const stubRows = [
    {
      type: 'product',
      id: PRODUCT_ID,
      code: 'AAA',
      name: 'Product A',
      categoryName: 'Shoes',
      imageCount: 2,
    },
    {
      type: 'orphan',
      id: ORPHAN_ID,
      code: 'BBB',
      name: 'Item B',
      categoryName: null,
      imageCount: 0,
    },
  ];
  const stubCategories = [
    { id: 'cat-root', parentGroupId: null },
    { id: 'cat-child', parentGroupId: 'cat-root' },
    { id: 'cat-grandchild', parentGroupId: 'cat-child' },
    { id: 'cat-other', parentGroupId: null },
  ];

  beforeEach(async () => {
    query = jest.fn((sql: string) => {
      if (sql.includes('FROM inventory_item_categories')) {
        return Promise.resolve(stubCategories);
      }
      if (sql.includes('COUNT(*)::int AS total')) {
        return Promise.resolve([{ total: 7 }]);
      }
      return Promise.resolve(stubRows);
    });
    resolvePublicUrls = jest.fn().mockResolvedValue(
      new Map([
        [
          PRODUCT_ID,
          [
            {
              id: 'media-1',
              url: 'http://cdn/erp-media-public/org/org-1/product/media-1',
              fileName: 'a.jpg',
              bucket: 'erp-media-public',
              objectKey: 'org/org-1/product/media-1',
            },
            {
              id: 'media-2',
              url: 'http://cdn/erp-media-public/org/org-1/product/media-2',
              fileName: 'b.jpg',
            },
          ],
        ],
      ]),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchProductImagesHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        { provide: MediaQueryService, useValue: { resolvePublicUrls } },
      ],
    }).compile();
    handler = module.get(SearchProductImagesHandler);
  });

  const run = (dto: Record<string, unknown>) =>
    handler.execute(new SearchProductImagesQuery(dto, actor));

  const callsFor = (needle: string) =>
    (query.mock.calls as [string, unknown[]][]).filter(([sql]) =>
      sql.includes(needle),
    );
  const dataCall = () => callsFor('ORDER BY c.code ASC')[0];
  const countCall = () => callsFor('COUNT(*)::int AS total')[0];

  it('embeds buildCombinedCte() verbatim, without arguments, in both statements', async () => {
    await run({});
    const [dataSql] = dataCall();
    const [countSql] = countCall();
    expect(dataSql).toContain(buildCombinedCte());
    expect(countSql).toContain(buildCombinedCte());
    // No-argument form: no stockTotal machinery leaks in.
    expect(dataSql).not.toContain('stockTotal');
  });

  it('scopes by organizationId ($1), defaults to MISSING, active only, code ASC, LIMIT/OFFSET', async () => {
    const res = await run({});
    const [sql, params] = dataCall();

    expect(params).toEqual(['org-1', 50, 0]);
    expect(sql).toContain('organization_id = $1');
    expect(sql).toContain('c."isActive" = true');
    expect(sql).toContain('img.count = 0');
    expect(sql).toContain('ORDER BY c.code ASC');
    expect(sql).toMatch(/LIMIT \$2 OFFSET \$3/);
    expect(res).toMatchObject({ total: 7, page: 1, limit: 50 });
  });

  it('paginates via LIMIT/OFFSET from page/limit', async () => {
    const res = await run({ page: 3, limit: 10 });
    const [, params] = dataCall();
    expect(params.slice(-2)).toEqual([10, 20]);
    expect(res).toMatchObject({ page: 3, limit: 10 });
  });

  it('counts ATTACHED media with the owner type derived from the CTE arm', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toContain(
      "m.owner_type = CASE c.type WHEN 'product' THEN 'PRODUCT' ELSE 'ITEM' END",
    );
    expect(sql).toContain("m.status = 'ATTACHED'");
    expect(sql).toContain('m.organization_id = $1::uuid');
    expect(sql).toContain('m.owner_id = c.id');
  });

  it('reads the category from the variants (MIN name) for both CTE arms', async () => {
    await run({});
    const [sql] = dataCall();
    expect(sql).toContain('MIN(ic.name)');
    expect(sql).toContain('(i.product_id = c.id OR i.id = c.id)');
    expect(sql).toContain('cat.name AS "categoryName"');
  });

  describe('imageStatus', () => {
    it('MISSING filters on a zero image count', async () => {
      await run({ imageStatus: ProductImageStatusFilter.MISSING });
      const [sql] = dataCall();
      expect(sql).toContain('img.count = 0');
      expect(sql).not.toContain('img.count > 0');
    });

    it('PRESENT filters on a positive image count', async () => {
      await run({ imageStatus: ProductImageStatusFilter.PRESENT });
      const [sql] = dataCall();
      expect(sql).toContain('img.count > 0');
      expect(sql).not.toContain('img.count = 0');
    });

    it('ALL adds no image predicate but still hides inactive groups', async () => {
      await run({ imageStatus: ProductImageStatusFilter.ALL });
      const [sql] = dataCall();
      expect(sql).not.toContain('img.count = 0');
      expect(sql).not.toContain('img.count > 0');
      expect(sql).toContain('c."isActive" = true');
    });
  });

  it('applies the same WHERE to the count query as to the data query', async () => {
    await run({
      imageStatus: ProductImageStatusFilter.PRESENT,
      keyword: 'abc',
    });
    const [dataSql, dataParams] = dataCall();
    const [countSql, countParams] = countCall();

    const whereOf = (sql: string) => sql.slice(sql.lastIndexOf('WHERE c.'));
    const dataWhere = whereOf(dataSql).replace(/\s*ORDER BY[\s\S]*$/, '').trim();
    const countWhere = whereOf(countSql).trim();
    expect(dataWhere).toBe(countWhere);
    // Data params = count params + limit + offset.
    expect(dataParams.slice(0, -2)).toEqual(countParams);
  });

  describe('categoryId', () => {
    it('loads the org category tree once and binds root + all descendants as a uuid[]', async () => {
      await run({ categoryId: 'cat-root' });

      const treeCalls = callsFor('FROM inventory_item_categories');
      expect(treeCalls).toHaveLength(1);
      expect(treeCalls[0][1]).toEqual(['org-1']);

      const [sql, params] = dataCall();
      expect(sql).toContain('i.category_id = ANY($2::uuid[])');
      expect(params[1]).toEqual(['cat-root', 'cat-child', 'cat-grandchild']);
      expect(params).toEqual([
        'org-1',
        ['cat-root', 'cat-child', 'cat-grandchild'],
        50,
        0,
      ]);
    });

    it('binds just the id itself when it is not in the org tree (0 results, no 404)', async () => {
      await run({ categoryId: 'cat-foreign' });
      const [, params] = dataCall();
      expect(params[1]).toEqual(['cat-foreign']);
    });

    it('does not query the category tree when no categoryId is given', async () => {
      await run({});
      expect(callsFor('FROM inventory_item_categories')).toHaveLength(0);
      expect(query).toHaveBeenCalledTimes(2);
    });
  });

  describe('keyword', () => {
    it('matches group code, group name and variant code with one placeholder', async () => {
      await run({ keyword: 'gelli' });
      const [sql, params] = dataCall();
      expect(params[1]).toBe('%gelli%');
      expect(sql).toContain('c.code ILIKE $2');
      expect(sql).toContain('c.name ILIKE $2');
      expect(sql).toMatch(/i\.product_id = c\.id AND i\.organization_id = \$1 AND i\.code ILIKE \$2/);
    });

    it('escapes wildcards so they match literally', async () => {
      await run({ keyword: '50%_off\\' });
      const [, params] = dataCall();
      expect(params[1]).toBe('%50\\%\\_off\\\\%');
    });

    it('ignores a blank keyword', async () => {
      await run({ keyword: '   ' });
      const [sql, params] = dataCall();
      expect(sql).not.toContain('ILIKE');
      expect(params).toEqual(['org-1', 50, 0]);
    });

    it('numbers the keyword placeholder after the category array', async () => {
      await run({ categoryId: 'cat-other', keyword: 'x' });
      const [sql, params] = dataCall();
      expect(params).toEqual(['org-1', ['cat-other'], '%x%', 50, 0]);
      expect(sql).toContain('ANY($2::uuid[])');
      expect(sql).toContain('c.code ILIKE $3');
      expect(sql).toMatch(/LIMIT \$4 OFFSET \$5/);
    });
  });

  it('calls resolvePublicUrls exactly once with the page ids and copies only the first URL', async () => {
    const res = await run({});

    expect(resolvePublicUrls).toHaveBeenCalledTimes(1);
    expect(resolvePublicUrls).toHaveBeenCalledWith(
      [PRODUCT_ID, ORPHAN_ID],
      'org-1',
    );

    expect(res.data).toEqual([
      {
        type: 'product',
        id: PRODUCT_ID,
        code: 'AAA',
        name: 'Product A',
        categoryName: 'Shoes',
        imageCount: 2,
        thumbnailUrl: 'http://cdn/erp-media-public/org/org-1/product/media-1',
      },
      {
        type: 'orphan',
        id: ORPHAN_ID,
        code: 'BBB',
        name: 'Item B',
        categoryName: null,
        imageCount: 0,
        thumbnailUrl: null,
      },
    ]);
    // Nothing from the media lookup other than the URL reaches the response.
    for (const row of res.data) {
      expect(row).not.toHaveProperty('bucket');
      expect(row).not.toHaveProperty('objectKey');
      expect(row).not.toHaveProperty('images');
    }
  });

  it('still calls resolvePublicUrls once for an empty page', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('COUNT(*)::int AS total') ? [{ total: 0 }] : [],
      ),
    );
    const res = await run({});
    expect(resolvePublicUrls).toHaveBeenCalledTimes(1);
    expect(resolvePublicUrls).toHaveBeenCalledWith([], 'org-1');
    expect(res).toEqual({ data: [], total: 0, page: 1, limit: 50 });
  });
});
