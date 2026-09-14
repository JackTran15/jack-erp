import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { PartnerProductSearchDto } from '../dto/partner-product-search.dto';
import { SearchPartnerProductsHandler } from './search-partner-products.handler';
import { SearchPartnerProductsQuery } from './search-partner-products.query';

const actor: ActorContext = {
  userId: 'partner-shadow-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const RAW = {
  inStock: true,
  id: 'p1',
  code: 'MY88610',
  name: 'Giày búp bê MY88610',
  categoryId: 'cat-1',
  categoryName: 'Giày nữ',
  priceMin: 495000,
  priceMax: 750000,
  matchedItemIds: ['item-p1-a', 'item-p1-b'],
};

describe('SearchPartnerProductsHandler', () => {
  let handler: SearchPartnerProductsHandler;
  let query: jest.Mock;

  const run = async (dto: PartnerProductSearchDto, rows = [RAW], total = 107) => {
    query = jest
      .fn()
      .mockResolvedValueOnce(rows) // data
      .mockResolvedValueOnce([{ total }]) // count
      .mockResolvedValueOnce([]); // facets for the page
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    handler = moduleRef.get(SearchPartnerProductsHandler);
    return handler.execute(new SearchPartnerProductsQuery(dto, actor));
  };

  const dataSql = () => query.mock.calls[0]![0] as string;
  const dataParams = () => query.mock.calls[0]![1] as unknown[];
  const countParams = () => query.mock.calls[1]![1] as unknown[];

  // AC-05
  it('returns the pagination envelope with the full match count', async () => {
    const res = await run({ page: 1, limit: 20 });

    expect(res.total).toBe(107);
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
    expect(res.data).toHaveLength(1);
  });

  it('translates page and limit into LIMIT/OFFSET', async () => {
    await run({ page: 6, limit: 20 });
    expect(dataParams()).toEqual(['org-1', 20, 100]);
  });

  it('defaults to page 1 with 20 rows', async () => {
    const res = await run({});
    expect(dataParams()).toEqual(['org-1', 20, 0]);
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
  });

  it('scopes every query to the actor organization', async () => {
    await run({});
    expect(dataParams()[0]).toBe('org-1');
    expect(countParams()).toEqual(['org-1']);
    expect(dataSql()).toContain('i.organization_id = $1');
    expect(dataSql()).toContain('p.organization_id = $1');
  });

  // AC-11
  it('maps a row to the published shape', async () => {
    const res = await run({});

    expect(res.data[0]).toEqual({
      id: 'p1',
      code: 'MY88610',
      name: 'Giày búp bê MY88610',
      categoryId: 'cat-1',
      categoryName: 'Giày nữ',
      priceMin: 495000,
      priceMax: 750000,
      colors: [],
      sizes: [],
      inStock: true,
      images: [],
    });
  });

  it('keeps prices numeric', async () => {
    const res = await run({});
    expect(typeof res.data[0]!.priceMin).toBe('number');
    expect(typeof res.data[0]!.priceMax).toBe('number');
  });

  // TypeORM returns numeric as a string unless the SQL casts; without the cast
  // the partner would receive "750000.00". Guard the cast, not the mock.
  it('casts the money columns to float in SQL', async () => {
    await run({});
    expect(dataSql()).toContain('MIN(ai.selling_price)::float');
    expect(dataSql()).toContain('MAX(ai.selling_price)::float');
  });

  it('only considers active products and active variants', async () => {
    await run({});
    expect(dataSql()).toContain('i.is_active = true');
    expect(dataSql()).toContain('p.is_active = true');
  });

  it('excludes stock rows with no parent product', async () => {
    await run({});
    expect(dataSql()).toContain('i.product_id IS NOT NULL');
  });

  it('never selects a purchase price column', async () => {
    await run({});
    expect(dataSql()).not.toContain('purchase_price');
    expect(dataSql()).not.toContain('purchasePrice');
  });

  // AC-13
  it('returns an empty envelope when nothing matches', async () => {
    const res = await run({}, [], 0);
    expect(res).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('reports zero rather than undefined when the count query returns nothing', async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    const res = await moduleRef
      .get(SearchPartnerProductsHandler)
      .execute(new SearchPartnerProductsQuery({}, actor));
    expect(res.total).toBe(0);
  });
});


describe('SearchPartnerProductsHandler — keyword and category filters', () => {
  let query: jest.Mock;
  let find: jest.Mock;

  const CATEGORIES = [
    { id: 'root', parentGroupId: null },
    { id: 'child', parentGroupId: 'root' },
    { id: 'grandchild', parentGroupId: 'child' },
    { id: 'other-root', parentGroupId: null },
  ];

  const run = async (dto: PartnerProductSearchDto, rows = [RAW], total = 1) => {
    query = jest
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([{ total }])
      .mockResolvedValueOnce([]);
    find = jest.fn().mockResolvedValue(CATEGORIES);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find },
        },
      ],
    }).compile();
    return moduleRef
      .get(SearchPartnerProductsHandler)
      .execute(new SearchPartnerProductsQuery(dto, actor));
  };

  const sql = () => query.mock.calls[0]![0] as string;
  const params = () => query.mock.calls[0]![1] as unknown[];

  it('adds no HAVING clause when no filter is supplied', async () => {
    await run({});
    expect(sql()).not.toContain('HAVING');
    expect(params()).toEqual(['org-1', 20, 0]);
  });

  // AC-06 — the parent category holds no items directly; filtering on it must
  // still return everything underneath, the bug the warehouse reports shipped once.
  it('expands a category filter to the whole subtree', async () => {
    await run({ categoryId: 'root' });

    const subtree = (params()[1] as string[]).slice().sort();
    expect(subtree).toEqual(['child', 'grandchild', 'root']);
    expect(subtree).not.toContain('other-root');
    expect(sql()).toContain('bool_or(ai.category_id = ANY($2::uuid[]))');
  });

  it('expands a leaf category to just itself', async () => {
    await run({ categoryId: 'grandchild' });
    expect(params()[1]).toEqual(['grandchild']);
  });

  // A category id from another organization is absent from the org's rows, so
  // it expands to nothing and matches nothing: no error, no existence leak.
  it('expands an unknown category to an empty list', async () => {
    await run({ categoryId: 'someone-elses-category' });
    expect(params()[1]).toEqual([]);
  });

  it('scopes the category lookup to the actor organization', async () => {
    await run({ categoryId: 'root' });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('does not query categories when no category filter is given', async () => {
    await run({});
    expect(find).not.toHaveBeenCalled();
  });

  // AC-09
  it('matches a keyword against product name, product code and variant SKU', async () => {
    await run({ keyword: 'bup be' });

    expect(params()[1]).toBe('%bup be%');
    expect(sql()).toContain('p.name ILIKE $2');
    expect(sql()).toContain('p.code ILIKE $2');
    expect(sql()).toContain('bool_or(ai.code ILIKE $2)');
  });

  // Measured, not assumed: the correlated-subquery form ran 290 ms against
  // 19 ms for bool_or on the reference dataset. Scoped to the HAVING clause,
  // which is where a keyword predicate would land.
  it('does not use a correlated OR EXISTS for the keyword', async () => {
    await run({ keyword: 'anything' });
    const text = sql();
    const having = text.slice(
      text.indexOf('HAVING'),
      text.indexOf('SELECT a.id'),
    );
    expect(having).toContain('bool_or(ai.code ILIKE');
    expect(having).not.toContain('EXISTS');
  });

  it('escapes LIKE metacharacters so they are searched, not interpreted', async () => {
    await run({ keyword: '100%' });
    expect(params()[1]).toBe('%100\\%%');
  });

  it('ignores a whitespace-only keyword', async () => {
    await run({ keyword: '   ' });
    expect(sql()).not.toContain('ILIKE');
  });

  it('combines a category and a keyword with AND', async () => {
    await run({ categoryId: 'root', keyword: 'giay' });

    expect(sql()).toContain('HAVING');
    expect(sql()).toContain('AND');
    expect((params()[1] as string[]).slice().sort()).toEqual([
      'child',
      'grandchild',
      'root',
    ]);
    expect(params()[2]).toBe('%giay%');
  });

  // Proving the filter filters: an impossible value must return nothing. A real
  // value would still pass even if the predicate were dropped entirely.
  it('returns zero rows for a keyword that cannot match', async () => {
    const res = await run({ keyword: 'zzz-not-a-product-zzz' }, [], 0);
    expect(res.data).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('keeps keyword and categoryId from narrowing the row', async () => {
    await run({ keyword: 'giay', categoryId: 'root' });
    // Product-level predicates sit in HAVING only. Inside active_items they
    // would drop variants before MIN/MAX; inside the agg FILTER they would
    // narrow the row the same way. Either changes what a chosen product
    // reports with the search terms (A-19, ADR-07).
    const text = sql();
    const activeItems = text.slice(
      text.indexOf('active_items AS'),
      text.indexOf('agg AS'),
    );
    expect(text).toContain('HAVING');
    expect(activeItems).not.toContain('ILIKE');
    expect(activeItems).not.toContain('category_id = ANY');
    expect(text).toContain('MIN(ai.selling_price)::float');
    expect(text).toContain('bool_or(ai.in_stock) AS "inStock"');
    expect(text).not.toContain('MIN(ai.selling_price) FILTER');
  });

  it('keeps categoryId out of the variant match when a colour filter is also set', async () => {
    await run({ categoryId: 'root', colors: ['D'] });
    const m = /MIN\(ai\.selling_price\) FILTER \(WHERE ([^()]*)\)\)::float/.exec(sql())?.[1];
    expect(m).toBeDefined();
    expect(m).toContain('ai.colors &&');
    expect(m).not.toContain('category_id');
  });
});

describe('SearchPartnerProductsHandler — inStock', () => {
  let query: jest.Mock;

  const run = async (
    branchIds: string[] | undefined,
    dto: PartnerProductSearchDto = {},
  ) => {
    query = jest
      .fn()
      .mockResolvedValueOnce([RAW])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    return moduleRef
      .get(SearchPartnerProductsHandler)
      .execute(
        new SearchPartnerProductsQuery(dto, { ...actor, branchIds }),
      );
  };

  const sql = () => query.mock.calls[0]![0] as string;
  const params = () => query.mock.calls[0]![1] as unknown[];

  // AC-12
  it('rolls stock up across a product variants with bool_or', async () => {
    await run(['b1', 'b2']);
    expect(sql()).toContain('bool_or(ai.in_stock)');
    expect(sql()).toContain('stock_balances sb');
  });

  // T-06-03 — in_stock comes from ONE join on the stocked-item set, never an
  // EXISTS column. active_items is inlined by Postgres, so an EXISTS column is
  // re-evaluated at every read of ai.in_stock (FILTERs, matchedItemIds,
  // HAVING): six stock_balances scans and 654 ms for inStock=true on
  // erp_dev_3008, against 34 ms with the join. Textually "one EXISTS" was not
  // enough to prevent that, so the shape itself is pinned.
  it.each<[string, PartnerProductSearchDto]>([
    ['no variant filter', {}],
    ['every variant filter', { colors: ['BA'], sizes: ['39'], priceFrom: 1, priceTo: 2 }],
    ['inStock=true with every variant filter', { colors: ['BA'], sizes: ['39'], priceFrom: 1, priceTo: 2, inStock: true }],
    ['inStock=false', { inStock: false }],
  ])('derives in_stock from a single stock join, never an EXISTS (%s)', async (_label, dto) => {
    await run(['b1', 'b2'], dto);
    const text = sql();
    expect(text).not.toMatch(/\bEXISTS\s*\(/i);
    expect(text.match(/stock_balances/g)).toHaveLength(1);
    expect(text).toMatch(
      /LEFT JOIN \(SELECT DISTINCT sb\.item_id FROM stock_balances sb\s+WHERE [\s\S]*?\) stk ON stk\.item_id = i\.id/,
    );
    expect(text).toContain('(stk.item_id IS NOT NULL) AS in_stock');
    // Everything past active_items reads the column, not the join alias.
    const afterActiveItems = text.slice(text.indexOf('agg AS'));
    expect(afterActiveItems).not.toContain('stk.');
    expect(text).toContain('bool_or(ai.in_stock)');
  });

  it('scopes stock to the branches the credential may see', async () => {
    await run(['b1', 'b2']);
    expect(params()).toContain('org-1');
    expect(params()[1]).toEqual(['b1', 'b2']);
    expect(sql()).toContain('sb.branch_id = ANY($2::varchar[])');
  });

  // An empty branch list must not silently mark everything out of stock.
  it('falls back to organization-wide stock when no branches are listed', async () => {
    await run([]);
    expect(sql()).not.toContain('sb.branch_id');
    expect(sql()).toContain('sb.organization_id = $1');
  });

  it('projects the flag straight through to the row', async () => {
    const res = await run(['b1']);
    expect(res.data[0]!.inStock).toBe(true);
  });

  it('never exposes a quantity', async () => {
    const res = await run(['b1']);
    expect(JSON.stringify(res.data[0])).not.toContain('quantity');
    expect(sql()).not.toMatch(/SELECT\s+sb\.quantity/);
  });
});

describe('SearchPartnerProductsHandler — price, colour and size', () => {
  let query: jest.Mock;

  const run = async (dto: PartnerProductSearchDto, facets: object[] = []) => {
    query = jest
      .fn()
      .mockResolvedValueOnce([RAW])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce(facets);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    return moduleRef
      .get(SearchPartnerProductsHandler)
      .execute(new SearchPartnerProductsQuery(dto, actor));
  };

  const sql = () => query.mock.calls[0]![0] as string;
  const params = () => query.mock.calls[0]![1] as unknown[];
  const having = () => {
    const t = sql();
    return t.slice(t.indexOf('HAVING'), t.indexOf('SELECT a.id'));
  };

  // AC-08 — the heart of it: colour and size must be satisfied by ONE variant.
  it('ANDs colour and size inside a single bool_or over variants', async () => {
    await run({ colors: ['BA'], sizes: ['39'] });

    const clause = having();
    // Exactly ONE bool_or, holding both conditions. Two separate bool_or calls
    // would match a product that has BA in one variant and 39 in another —
    // the precise wrong answer this ticket exists to prevent.
    expect(clause.match(/bool_or\(/g)).toHaveLength(1);
    expect(clause).toContain('ai.colors &&');
    expect(clause).toContain('ai.sizes &&');
    expect(clause).toMatch(/ai\.colors &&[^)]*AND[^)]*ai\.sizes &&/);
  });

  it('uses array overlap so several values of one dimension are an OR', async () => {
    await run({ sizes: ['38', '39'] });
    expect(having()).toContain('ai.sizes && $');
    expect(params()).toContainEqual(['38', '39']);
  });

  // varchar[], not text[]: value_label is varchar and && has no mixed overload,
  // so a text[] cast fails at runtime only once a filter is supplied.
  it('casts facet arrays to varchar, never text', async () => {
    await run({ colors: ['BA'] });
    expect(sql()).toContain('::varchar[]');
    expect(sql()).not.toContain('::text[]');
  });

  // AC-07
  it('applies the price bounds to the same variant as the attributes', async () => {
    await run({ colors: ['BA'], priceFrom: 500000, priceTo: 1000000 });

    const clause = having();
    expect(clause).toContain('ai.selling_price >=');
    expect(clause).toContain('ai.selling_price <=');
    expect(clause.match(/bool_or/g)).toHaveLength(1);
    expect(params()).toContain(500000);
    expect(params()).toContain(1000000);
  });

  it('supports an open-ended price range', async () => {
    await run({ priceFrom: 500000 });
    expect(having()).toContain('ai.selling_price >=');
    expect(having()).not.toContain('ai.selling_price <=');
  });

  // AC-23 — under a variant-level filter, priceMin/priceMax/inStock describe
  // only the matching variants (ADR-07). The FILTER must be EXACTLY the match
  // expression membership uses: a predicate dropped from either side (say
  // `priceTo` kept in HAVING but missing from the FILTER) reports a price range
  // or a stock flag from variants the partner filtered out.
  it.each<[string, PartnerProductSearchDto, string[]]>([
    ['colour', { colors: ['BA'] }, ['ai.colors &&']],
    ['size', { sizes: ['39'] }, ['ai.sizes &&']],
    ['price range', { priceFrom: 700000, priceTo: 760000 }, ['ai.selling_price >=', 'ai.selling_price <=']],
    [
      'colour + size + price range',
      { colors: ['BA'], sizes: ['39'], priceFrom: 700000, priceTo: 760000 },
      ['ai.colors &&', 'ai.sizes &&', 'ai.selling_price >=', 'ai.selling_price <='],
    ],
    // T-06-03 / ADR-08 — inStock=true folds into `m` exactly like colour/size/
    // price, so the same narrowing has to hold for it too.
    ['inStock=true', { inStock: true }, ['ai.in_stock']],
    [
      'colour + size + price range + inStock=true',
      { colors: ['BA'], sizes: ['39'], priceFrom: 700000, priceTo: 760000, inStock: true },
      ['ai.colors &&', 'ai.sizes &&', 'ai.selling_price >=', 'ai.selling_price <=', 'ai.in_stock'],
    ],
  ])('narrows priceMin, priceMax and inStock by exactly the match expression (%s)', async (_label, dto, parts) => {
    await run(dto);
    const text = sql();
    const m = /HAVING bool_or\(([^()]*)\)/.exec(text)?.[1];
    expect(m).toBeDefined();
    expect(m!.split(' AND ')).toHaveLength(parts.length);
    for (const part of parts) expect(m).toContain(part);

    expect(text).toContain(`(MIN(ai.selling_price) FILTER (WHERE ${m}))::float AS "priceMin"`);
    expect(text).toContain(`(MAX(ai.selling_price) FILTER (WHERE ${m}))::float AS "priceMax"`);
    expect(text).toContain(`bool_or(ai.in_stock) FILTER (WHERE ${m}) AS "inStock"`);
    // T-06-02 — the facet query must key on the SAME matched variants, so the
    // id aggregate has to carry the exact same FILTER as priceMin/priceMax/inStock.
    expect(text).toContain(`array_agg(ai.id) FILTER (WHERE ${m}) AS "matchedItemIds"`);
  });

  // AC-24 / ADR-08 — `inStock=false` means "some variant matches the OTHER
  // filters, and none of those matching variants has stock": an inverted
  // membership test the builder never sees, kept OUT of the FILTER expression
  // so the row still reports on every variant that matched, not on a subset
  // narrowed by stock (A-16: "false" is not "has some out-of-stock variant").
  it.each<[string, PartnerProductSearchDto, string[]]>([
    [
      'colour + size + price range',
      { colors: ['BA'], sizes: ['39'], priceFrom: 700000, priceTo: 760000, inStock: false },
      ['ai.colors &&', 'ai.sizes &&', 'ai.selling_price >=', 'ai.selling_price <='],
    ],
  ])('inverts membership on the other predicates for inStock=false without touching the FILTER (%s)', async (_label, dto, parts) => {
    await run(dto);
    const text = sql();
    const m = /HAVING bool_or\(([^()]*)\) AND NOT bool_or\(\1 AND ai\.in_stock\)/.exec(text)?.[1];
    expect(m).toBeDefined();
    expect(m!.split(' AND ')).toHaveLength(parts.length);
    for (const part of parts) expect(m).toContain(part);

    expect(text).toContain(`(MIN(ai.selling_price) FILTER (WHERE ${m}))::float AS "priceMin"`);
    expect(text).toContain(`(MAX(ai.selling_price) FILTER (WHERE ${m}))::float AS "priceMax"`);
    expect(text).toContain(`bool_or(ai.in_stock) FILTER (WHERE ${m}) AS "inStock"`);
    expect(text).toContain(`array_agg(ai.id) FILTER (WHERE ${m}) AS "matchedItemIds"`);

    // The stock predicate belongs to the HAVING inversion above only. Keeping
    // it out of the FILTERs is an implementation choice rather than a
    // behaviour: for every admitted row the matching variants are all out of
    // stock, so the FILTERs would describe the same variants either way. This
    // pins the choice so HAVING stays the one place the stock test is written.
    const filterClauses = [...text.matchAll(/FILTER \(WHERE ([^()]*)\)/g)].map(
      (match) => match[1],
    );
    expect(filterClauses.length).toBeGreaterThan(0);
    for (const clause of filterClauses) expect(clause).not.toContain('ai.in_stock');
  });

  // AC-24 / ADR-08 — with no other variant-level predicate, "false" reduces to
  // "no active variant is in stock"; the join into `active_items` already
  // guarantees at least one variant exists, so no FILTER is needed at all —
  // the row reports on every active variant, which membership already
  // guarantees are all out of stock.
  it('inverts membership with no other predicate for inStock=false alone', async () => {
    await run({ inStock: false });
    const text = sql();

    expect(text).toContain('HAVING NOT bool_or(ai.in_stock)');
    expect(text).not.toContain('MIN(ai.selling_price) FILTER');
    expect(text).not.toContain('MAX(ai.selling_price) FILTER');
    expect(text).not.toContain('bool_or(ai.in_stock) FILTER');
    expect(text).not.toContain('array_agg(ai.id) FILTER');
    expect(text).toContain('MIN(ai.selling_price)::float');
    expect(text).toContain('bool_or(ai.in_stock) AS "inStock"');
    expect(text).toContain('array_agg(ai.id) AS "matchedItemIds"');
  });

  // AC-23 — sort already reads a."priceMin"/a."priceMax"; this proves that
  // under a filter those columns are the narrowed ones, so the ordering is
  // narrowed too, without needing to touch the sort code at all.
  it('sorts by the narrowed priceMin when sort=price_asc and a colour filter is applied', async () => {
    await run({ colors: ['BA'], sort: 'price_asc' });
    const text = sql();
    expect(text).toContain('ORDER BY a."priceMin" ASC, a.id ASC');
    expect(text).toContain('MIN(ai.selling_price) FILTER (WHERE ai.colors &&');
  });

  // AC-23 — with no variant-level filter at all, `agg` must stay exactly the
  // shape it was before this ticket: no FILTER on the aggregates.
  it('applies no FILTER to price/inStock when no variant-level filter is supplied', async () => {
    await run({});
    const text = sql();
    expect(text).toContain('MIN(ai.selling_price)::float');
    expect(text).toContain('MAX(ai.selling_price)::float');
    expect(text).toContain('bool_or(ai.in_stock) AS "inStock"');
    expect(text).not.toContain('MIN(ai.selling_price) FILTER');
    expect(text).not.toContain('MAX(ai.selling_price) FILTER');
    expect(text).not.toContain('bool_or(ai.in_stock) FILTER');
    // T-06-02 — unfiltered, the matched-id aggregate is every active variant,
    // same shape as the unfiltered facet query before this ticket.
    expect(text).toContain('array_agg(ai.id) AS "matchedItemIds"');
    expect(text).not.toContain('array_agg(ai.id) FILTER');
  });

  // The attribute roll-up costs ~100ms; it must not be paid by requests that
  // do not filter on attributes.
  it('omits the attribute join entirely when no facet filter is given', async () => {
    await run({ priceFrom: 1 });
    expect(sql()).not.toContain('item_attrs');
  });

  it('includes the attribute join only when filtering on a facet', async () => {
    await run({ colors: ['BA'] });
    expect(sql()).toContain('item_attrs');
  });

  it('matches dimension names case-insensitively via the alias list', async () => {
    await run({ colors: ['BA'] });
    expect(sql()).toContain('lower(d.name) = ANY(');
    const aliasArrays = params().filter(
      (p): p is string[] => Array.isArray(p) && p.includes('color'),
    );
    expect(aliasArrays.length).toBeGreaterThan(0);
    expect(aliasArrays[0]).toContain('màu sắc');
  });

  it('fills colours and sizes on the row from the facet query', async () => {
    const res = await run({}, [
      { productId: 'p1', colors: ['D', 'BA'], sizes: ['39', '38'] },
    ]);
    expect(res.data[0]!.colors).toEqual(['BA', 'D']);
    expect(res.data[0]!.sizes).toEqual(['38', '39']);
  });

  it('returns empty facets rather than null when a product has no attributes', async () => {
    const res = await run({}, [{ productId: 'p1', colors: null, sizes: null }]);
    expect(res.data[0]!.colors).toEqual([]);
    expect(res.data[0]!.sizes).toEqual([]);
  });

  // T-06-02 — the facet query must be keyed on the matched-variant ids the
  // main query returned per row, flattened across the whole page, never on
  // product ids: keying on product id would re-aggregate over every active
  // variant and reintroduce the ADR-07 bug (colors=['BA'] still showing 'D').
  it('queries facets by the flattened matched item ids from every page row, not by product id', async () => {
    const rows = [
      { ...RAW, id: 'p1', matchedItemIds: ['v1', 'v2'] },
      { ...RAW, id: 'p2', matchedItemIds: ['v3'] },
    ];
    query = jest
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([
        { productId: 'p1', colors: ['BA'], sizes: ['38'] },
        { productId: 'p2', colors: ['D'], sizes: ['40'] },
      ]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    const res = await moduleRef
      .get(SearchPartnerProductsHandler)
      .execute(new SearchPartnerProductsQuery({ colors: ['BA'] }, actor));

    const facetSql = query.mock.calls[2]![0] as string;
    const facetParams = query.mock.calls[2]![1] as unknown[];
    expect(facetSql).toContain('i.id = ANY($4::uuid[])');
    expect(facetSql).not.toContain('i.product_id = ANY(');
    expect(facetParams[3]).toEqual(['v1', 'v2', 'v3']);
    // Keyed on item ids, the organization predicate is the only tenant check
    // left in this statement — it must stay, bound to the actor's org.
    expect(facetSql).toContain('i.organization_id = $1');
    expect(facetSql).toContain('i.is_active = true');
    expect(facetParams[0]).toBe('org-1');
    expect(res.data.find((r) => r.id === 'p1')!.colors).toEqual(['BA']);
    expect(res.data.find((r) => r.id === 'p2')!.colors).toEqual(['D']);
  });

  // T-06-02 — matchedItemIds is an internal plumbing column between the two
  // queries; the response contract (locked by partner-catalog-contract.spec.ts)
  // must never see it.
  it('never lets the matched-item-id aggregate reach the response row', async () => {
    const res = await run({});
    expect(res.data[0]).not.toHaveProperty('matchedItemIds');
    const serialized = JSON.stringify(res.data[0]);
    expect(serialized).not.toContain('matchedItemIds');
    expect(serialized).not.toContain(RAW.matchedItemIds[0]);
  });

  it('does not run the facet query when the page is empty', async () => {
    query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPartnerProductsHandler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { manager: { query } },
        },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    const res = await moduleRef
      .get(SearchPartnerProductsHandler)
      .execute(new SearchPartnerProductsQuery({}, actor));

    expect(res.data).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
