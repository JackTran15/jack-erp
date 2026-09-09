import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { TempWarehouseStagedStockService } from '../../inventory/temp-warehouse/temp-warehouse-staged-stock.service';
import { PosCatalogService } from './pos-catalog.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['cashier'],
};

describe('PosCatalogService.lookupByCode', () => {
  let service: PosCatalogService;
  let query: jest.Mock;
  let getBranchDelta: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    getBranchDelta = jest.fn().mockResolvedValue(new Map<string, number>());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: DataSource, useValue: { query } },
        {
          provide: TempWarehouseStagedStockService,
          useValue: { getBranchDelta: getBranchDelta },
        },
      ],
    }).compile();

    service = module.get(PosCatalogService);
  });

  it('passes org, branch and code to the exact-match query', async () => {
    query.mockResolvedValue([]);

    await service.lookupByCode('branch-1', actor, '8935049510016');

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['org-1', 'branch-1', '8935049510016']);
  });

  it('matches through a UNION of index-driven arms, not an OR across a join', async () => {
    query.mockResolvedValue([]);

    await service.lookupByCode('branch-1', actor, 'X');

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('WITH matched AS');
    expect(sql).toContain('UNION');
    // The shape this replaced. An OR spanning a LEFT JOIN cannot use either
    // unique index, so Postgres scanned items and item_barcodes in full.
    expect(sql).not.toContain('LEFT JOIN item_barcodes');
    expect(sql).not.toContain('i.code = $3 OR b.code = $3');
  });

  it('reads branch stock only for the items the match already produced', async () => {
    query.mockResolvedValue([]);

    await service.lookupByCode('branch-1', actor, 'X');

    const [sql] = query.mock.calls[0] as [string];
    // stock_balances hangs off the matched set, not off every POS-visible item.
    expect(sql).toContain('FROM matched m');
    expect(sql.indexOf('WITH matched AS')).toBeLessThan(
      sql.indexOf('LEFT JOIN stock_balances'),
    );
  });

  it('returns a single line with aggregated stock for a barcode match', async () => {
    query.mockResolvedValue([
      {
        itemId: 'I1',
        productId: 'P1',
        code: 'LAPTOP-15',
        name: 'Laptop 15 inch',
        unit: 'pcs',
        sellingPrice: '1500',
        locationId: 'L1',
        locationName: 'Kệ A',
        quantity: '5',
      },
      {
        itemId: 'I1',
        productId: 'P1',
        code: 'LAPTOP-15',
        name: 'Laptop 15 inch',
        unit: 'pcs',
        sellingPrice: '1500',
        locationId: 'L2',
        locationName: 'Kệ B',
        quantity: '3',
      },
    ]);

    const res = await service.lookupByCode('branch-1', actor, '8935049510016');

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      itemId: 'I1',
      productId: 'P1',
      code: 'LAPTOP-15',
      sellingPrice: 1500,
      quantityOnHand: 8, // 5 + 3
      defaultLocationId: 'L1', // location with the most stock
    });
    expect(res[0].locations).toEqual([
      { locationId: 'L1', name: 'Kệ A', quantity: 5 },
      { locationId: 'L2', name: 'Kệ B', quantity: 3 },
    ]);
  });

  it('does not double-count stock when an item fans out across multiple barcodes', async () => {
    // Same item matched on the SKU code while it owns two barcodes → the join
    // duplicates each stock_balances row once per barcode.
    query.mockResolvedValue([
      {
        itemId: 'I1',
        productId: null,
        code: 'BUT-01',
        name: 'Bút',
        unit: 'cây',
        sellingPrice: '50',
        locationId: 'L1',
        locationName: 'Kệ A',
        quantity: '10',
      },
      {
        itemId: 'I1',
        productId: null,
        code: 'BUT-01',
        name: 'Bút',
        unit: 'cây',
        sellingPrice: '50',
        locationId: 'L1',
        locationName: 'Kệ A',
        quantity: '10',
      },
    ]);

    const res = await service.lookupByCode('branch-1', actor, 'BUT-01');

    expect(res).toHaveLength(1);
    expect(res[0].quantityOnHand).toBe(10);
    expect(res[0].locations).toHaveLength(1);
  });

  it('returns a zero-stock line (no locations) when the item has no branch stock', async () => {
    query.mockResolvedValue([
      {
        itemId: 'I9',
        productId: null,
        code: 'NOSTOCK-1',
        name: 'Hàng chưa nhập',
        unit: 'cái',
        sellingPrice: '20',
        locationId: null,
        locationName: null,
        quantity: null,
      },
    ]);

    const res = await service.lookupByCode('branch-1', actor, 'NOSTOCK-1');

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      itemId: 'I9',
      quantityOnHand: 0,
      defaultLocationId: '',
    });
    expect(res[0].locations).toEqual([]);
  });

  it('returns multiple lines when the code matches more than one item', async () => {
    query.mockResolvedValue([
      {
        itemId: 'I1',
        productId: null,
        code: 'DUP',
        name: 'A',
        unit: 'cái',
        sellingPrice: '10',
        locationId: 'L1',
        locationName: 'Kệ A',
        quantity: '1',
      },
      {
        itemId: 'I2',
        productId: null,
        code: 'DUP',
        name: 'B',
        unit: 'cái',
        sellingPrice: '10',
        locationId: 'L1',
        locationName: 'Kệ A',
        quantity: '1',
      },
    ]);

    const res = await service.lookupByCode('branch-1', actor, 'DUP');

    expect(res.map((r) => r.itemId)).toEqual(['I1', 'I2']);
  });

  it('returns an empty array when nothing matches', async () => {
    query.mockResolvedValue([]);

    const res = await service.lookupByCode('branch-1', actor, 'MISSING');

    expect(res).toEqual([]);
  });

  // Barcode scan and typed search must land on the same oversell threshold for
  // the same item. lookupByCode shares aggregateStockRows with getCatalog but
  // its own query selects no classification flag at all (A-10), so this is the
  // case that catches "scanning warns at a different number than typing".
  it('reports the same showroom-only basis as the search path (A-10)', async () => {
    query.mockResolvedValue([
      {
        itemId: 'BX140',
        productId: null,
        code: 'BX140',
        name: 'BX140',
        unit: 'CHAI',
        sellingPrice: '140000',
        locationId: 'L-WH',
        locationName: '999',
        quantity: '8',
        isMainStorage: false,
      },
      {
        itemId: 'BX140',
        productId: null,
        code: 'BX140',
        name: 'BX140',
        unit: 'CHAI',
        sellingPrice: '140000',
        locationId: 'L-SR',
        locationName: 'Mặc định',
        quantity: '4',
        isMainStorage: true,
      },
    ]);

    const res = await service.lookupByCode('branch-1', actor, 'BX140');

    expect(res[0].sellableQuantity).toBe(4);
    expect(res[0].quantityOnHand).toBe(12);
  });
});

describe('PosCatalogService.getCatalog', () => {
  let service: PosCatalogService;
  let query: jest.Mock;
  let getBranchDelta: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    getBranchDelta = jest.fn().mockResolvedValue(new Map<string, number>());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: DataSource, useValue: { query } },
        {
          provide: TempWarehouseStagedStockService,
          useValue: { getBranchDelta: getBranchDelta },
        },
      ],
    }).compile();

    service = module.get(PosCatalogService);
  });

  it('matches name, SKU code, barcode and parent product via UNIONed arms', async () => {
    query.mockResolvedValue([]);

    await service.getCatalog('branch-1', actor, '893');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['org-1', 'branch-1', '%893%']);
    expect(sql).toContain('WITH matched AS');
    expect(sql).toContain('LEFT JOIN stock_balances sb');
    expect(sql).toContain('i.name ILIKE $3');
    expect(sql).toContain('i.code ILIKE $3');
    expect(sql).toContain('b.code ILIKE $3');
    expect(sql).toContain('p.code ILIKE $3');
    expect(sql).toContain('p.name ILIKE $3');
    expect(sql).toContain('i.is_pos_visible = true');
    // The shape this replaced: four ILIKEs ORed across a LEFT JOIN, which no
    // trigram index could serve.
    expect(sql).not.toContain('LEFT JOIN item_barcodes');
  });

  it('leaves the catalogue endpoint uncapped so fast stock transfer still sees every match', async () => {
    query.mockResolvedValue([]);

    await service.getCatalog('branch-1', actor, '893');

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toContain('LIMIT');
  });

  it('returns one line for an item that two of its barcodes both match', async () => {
    // The UNION already de-duplicates by item id, so the driver never sees the
    // fan-out the LEFT JOIN used to produce; the aggregation stays idempotent
    // either way.
    query.mockResolvedValue([
      {
        itemId: 'I7',
        productId: 'P7',
        code: 'DUP-1',
        name: 'Hàng hai mã vạch',
        unit: 'cái',
        sellingPrice: '50',
        locationId: 'L1',
        locationName: 'Kệ A',
        quantity: '3',
        isShowroom: true,
        isMainStorage: true,
      },
    ]);

    const res = await service.getCatalog('branch-1', actor, 'DUP');

    expect(res).toHaveLength(1);
    expect(res[0]!.quantityOnHand).toBe(3);
  });

  it('returns a zero-stock line when search matches but branch has no stock', async () => {
    query.mockResolvedValue([
      {
        itemId: 'I9',
        productId: null,
        code: 'ABA2777-D-38',
        name: 'Giày nam ABA2777-D-38',
        unit: 'đôi',
        sellingPrice: '100',
        locationId: null,
        locationName: null,
        quantity: null,
        isShowroom: null,
      },
    ]);

    const res = await service.getCatalog('branch-1', actor, 'ABA');

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      itemId: 'I9',
      code: 'ABA2777-D-38',
      quantityOnHand: 0,
      defaultLocationId: '',
    });
    expect(res[0].locations).toEqual([]);
  });

  it('omits the search clause (and the pattern param) when no term is given', async () => {
    query.mockResolvedValue([]);

    await service.getCatalog('branch-1', actor);

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['org-1', 'branch-1']);
    expect(sql).not.toContain('ILIKE');
  });

  // Field reproduced from branch MT46: BX140 sits 8 at a warehouse shelf and 4
  // at the showroom's default shelf. POS deducts from the branch's main
  // (showroom) storages only — resolveBranchItemLocations(..., showroomOnly) —
  // so 4, not 12, is what the oversell warning has to compare against.
  const bx140Rows = [
    {
      itemId: 'BX140',
      productId: null,
      code: 'BX140',
      name: 'BX140',
      unit: 'CHAI',
      sellingPrice: '140000',
      locationId: 'L-WH',
      locationName: '999',
      quantity: '8',
      isShowroom: false,
      isMainStorage: false,
    },
    {
      itemId: 'BX140',
      productId: null,
      code: 'BX140',
      name: 'BX140',
      unit: 'CHAI',
      sellingPrice: '140000',
      locationId: 'L-SR',
      locationName: 'Mặc định',
      quantity: '4',
      isShowroom: true,
      isMainStorage: true,
    },
  ];

  it('sums sellableQuantity from main-storage locations only', async () => {
    query.mockResolvedValue(bx140Rows);

    const res = await service.getCatalog('branch-1', actor);

    expect(res).toHaveLength(1);
    expect(res[0].sellableQuantity).toBe(4);
  });

  it('keeps quantityOnHand as the branch-wide total', async () => {
    // quantityOnHand still means "every location in the branch" — fast stock
    // transfer reads it and nothing tells it the meaning moved (A-07).
    query.mockResolvedValue(bx140Rows);

    const res = await service.getCatalog('branch-1', actor);

    expect(res[0].quantityOnHand).toBe(12);
    expect(res[0].locations).toHaveLength(2);
    expect(res[0].defaultLocationId).toBe('L-WH');
  });

  // This case exists to block the tempting one-line fix: passing
  // direction=showroom. aggregateStockRows filters *rows* before grouping, so
  // an item stocked only in a warehouse would drop out of the catalogue
  // entirely — unsearchable, unsellable, no oversell to warn about (A-04).
  // Showing it with sellableQuantity 0 is the point: warn, do not hide.
  it('keeps warehouse-only items in the result with sellableQuantity 0', async () => {
    query.mockResolvedValue([
      ...bx140Rows,
      {
        itemId: 'I-WH-ONLY',
        productId: null,
        code: 'WH-ONLY',
        name: 'Hàng chưa ra quầy',
        unit: 'cái',
        sellingPrice: '50000',
        locationId: 'L-WH',
        locationName: '999',
        quantity: '7',
        isShowroom: false,
        isMainStorage: false,
      },
    ]);

    const res = await service.getCatalog('branch-1', actor);

    expect(res.map((r) => r.itemId).sort()).toEqual(['BX140', 'I-WH-ONLY']);
    const whOnly = res.find((r) => r.itemId === 'I-WH-ONLY')!;
    expect(whOnly.sellableQuantity).toBe(0);
    expect(whOnly.quantityOnHand).toBe(7);
  });

  // A POS sale deducts in two beats: the showroom first, then the branch's open
  // temp-warehouse session. The warning threshold has to sit on the sum, or it
  // fires on transactions the till can complete in full.
  it('adds stock staged into the showroom to sellableQuantity', async () => {
    query.mockResolvedValue(bx140Rows);
    getBranchDelta.mockResolvedValue(new Map([['BX140', 3]]));

    const res = await service.getCatalog('branch-1', actor);

    expect(res[0].sellableQuantity).toBe(7);
    expect(res[0].quantityOnHand).toBe(12);
  });

  it('subtracts stock staged out of the showroom', async () => {
    query.mockResolvedValue(bx140Rows);
    getBranchDelta.mockResolvedValue(new Map([['BX140', -1]]));

    const res = await service.getCatalog('branch-1', actor);

    expect(res[0].sellableQuantity).toBe(3);
  });

  it('floors sellableQuantity at 0 when more is staged out than is on hand', async () => {
    query.mockResolvedValue(bx140Rows);
    getBranchDelta.mockResolvedValue(new Map([['BX140', -9]]));

    const res = await service.getCatalog('branch-1', actor);

    expect(res[0].sellableQuantity).toBe(0);
  });

  it('leaves items with no staged line untouched', async () => {
    query.mockResolvedValue(bx140Rows);
    getBranchDelta.mockResolvedValue(new Map([['SOMETHING-ELSE', 5]]));

    const res = await service.getCatalog('branch-1', actor);

    expect(res[0].sellableQuantity).toBe(4);
  });

  it('reads the staged delta once, scoped to the branch and organization', async () => {
    query.mockResolvedValue(bx140Rows);

    await service.getCatalog('branch-1', actor);

    expect(getBranchDelta).toHaveBeenCalledTimes(1);
    expect(getBranchDelta).toHaveBeenCalledWith('branch-1', 'org-1');
  });

  // The three ways an item reaches the cart must agree, or the cashier sees one
  // number in the grid and a different threshold on the line.
  it('gives the same sellableQuantity through search and through barcode lookup', async () => {
    getBranchDelta.mockResolvedValue(new Map([['BX140', 3]]));
    query.mockResolvedValue(bx140Rows);

    const bySearch = await service.getCatalog('branch-1', actor, 'BX');
    const byLookup = await service.lookupByCode('branch-1', actor, 'BX140');

    expect(bySearch[0].sellableQuantity).toBe(7);
    expect(byLookup[0].sellableQuantity).toBe(7);
  });
});

describe('PosCatalogService.searchCatalog', () => {
  let service: PosCatalogService;
  let query: jest.Mock;
  let getBranchDelta: jest.Mock;

  const stockRow = (over: Record<string, unknown> = {}) => ({
    itemId: 'I1',
    productId: 'P1',
    code: 'SKU-1',
    name: 'Hàng thử',
    unit: 'cái',
    sellingPrice: '100',
    locationId: 'L1',
    locationName: 'Kệ A',
    quantity: '4',
    isMainStorage: true,
    ...over,
  });

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    getBranchDelta = jest.fn().mockResolvedValue(new Map<string, number>());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: DataSource, useValue: { query } },
        {
          provide: TempWarehouseStagedStockService,
          useValue: { getBranchDelta },
        },
      ],
    }).compile();
    service = module.get(PosCatalogService);
  });

  it('reads the staged temp-warehouse delta once for the whole request', async () => {
    // Both arms need it to compute sellableQuantity; reading it per arm would
    // double a query that has nothing to do with the search term.
    await service.searchCatalog('branch-1', actor, { term: '235', limit: 20 });

    expect(getBranchDelta).toHaveBeenCalledTimes(1);
    expect(getBranchDelta).toHaveBeenCalledWith('branch-1', 'org-1');
  });

  it('issues both arms by default', async () => {
    await service.searchCatalog('branch-1', actor, { term: '235', limit: 20 });

    expect(query).toHaveBeenCalledTimes(2);
    const sqls = query.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('i.code = $3'))).toBe(true);
    expect(sqls.some((s) => s.includes('i.name ILIKE $3'))).toBe(true);
  });

  it('skips the fuzzy arm entirely when exactOnly is set', async () => {
    // The Enter key and a barcode scan want this: it is also the only way to
    // stay clear of a one- or two-character term, which no trigram can serve.
    await service.searchCatalog('branch-1', actor, {
      term: '2',
      exactOnly: true,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('i.code = $3');
  });

  it('passes the row cap to the fuzzy arm and nothing to the exact arm', async () => {
    await service.searchCatalog('branch-1', actor, { term: '235', limit: 7 });

    const fuzzy = query.mock.calls
      .map((c) => c[0] as string)
      .find((s) => s.includes('ILIKE'))!;
    expect(fuzzy).toContain('LIMIT 7');
  });

  it('wraps the term in ILIKE wildcards and strips LIKE metacharacters', async () => {
    await service.searchCatalog('branch-1', actor, { term: ' 50%_ ', limit: 20 });

    const fuzzy = query.mock.calls.find((c) =>
      (c[0] as string).includes('ILIKE'),
    )!;
    expect(fuzzy[1]).toEqual(['org-1', 'branch-1', '%50%']);
  });

  it('reports the exact hit when exactly one item matches', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('i.code = $3') ? [stockRow()] : []),
    );

    const res = await service.searchCatalog('branch-1', actor, { term: 'SKU-1' });

    expect(res.exact).toMatchObject({ itemId: 'I1', sellableQuantity: 4 });
  });

  it('reports no exact hit when two items share the code', async () => {
    // Auto-adding needs a unique answer; "which one" is not a question the
    // caller can resolve on a barcode scan.
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('i.code = $3')
          ? [stockRow(), stockRow({ itemId: 'I2', code: 'SKU-1' })]
          : [],
      ),
    );

    const res = await service.searchCatalog('branch-1', actor, { term: 'SKU-1' });

    expect(res.exact).toBeNull();
  });

  it('reports no exact hit when nothing matches', async () => {
    const res = await service.searchCatalog('branch-1', actor, { term: 'nope' });

    expect(res.exact).toBeNull();
    expect(res.suggestions).toEqual([]);
  });

  it('applies the staged delta to both arms from the single read', async () => {
    getBranchDelta.mockResolvedValue(new Map([['I1', 3]]));
    query.mockResolvedValue([stockRow()]);

    const res = await service.searchCatalog('branch-1', actor, { term: 'SKU-1' });

    expect(res.exact).toMatchObject({ sellableQuantity: 7 });
    expect(res.suggestions[0]).toMatchObject({ sellableQuantity: 7 });
  });
});

describe('PosCatalogService.getStockForItems', () => {
  let service: PosCatalogService;
  let query: jest.Mock;
  let getBranchDelta: jest.Mock;

  const row = (over: Record<string, unknown> = {}) => ({
    itemId: 'I1',
    productId: 'P1',
    code: 'SKU-1',
    name: 'Hàng thử',
    unit: 'cái',
    sellingPrice: '100',
    locationId: 'L1',
    locationName: 'Kệ A',
    quantity: '4',
    isMainStorage: true,
    ...over,
  });

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    getBranchDelta = jest.fn().mockResolvedValue(new Map<string, number>());
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: DataSource, useValue: { query } },
        {
          provide: TempWarehouseStagedStockService,
          useValue: { getBranchDelta },
        },
      ],
    }).compile();
    service = module.get(PosCatalogService);
  });

  it('binds the id list as one array parameter, never as SQL text', async () => {
    const ids = ['I1', 'I2', 'I3'];

    await service.getStockForItems('branch-1', actor, ids);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['org-1', 'branch-1', ids]);
    expect(Array.isArray(params[2])).toBe(true);
    expect(sql).toContain('= ANY($3::uuid[])');
    expect(sql).not.toContain('IN (');
  });

  it('returns one line per matched item', async () => {
    query.mockResolvedValue([
      row(),
      row({ itemId: 'I2', code: 'SKU-2', name: 'Hàng hai', quantity: '7' }),
      row({ itemId: 'I3', code: 'SKU-3', name: 'Hàng ba', quantity: '1' }),
    ]);

    const res = await service.getStockForItems('branch-1', actor, [
      'I1',
      'I2',
      'I3',
    ]);

    expect(res.map((r) => r.itemId).sort()).toEqual(['I1', 'I2', 'I3']);
  });

  it('returns a zero-stock line for an item the branch holds nothing of', async () => {
    // Same contract as lookupByCode: the caller must be able to tell "no stock"
    // apart from "no such item".
    query.mockResolvedValue([
      row({ locationId: null, locationName: null, quantity: null }),
    ]);

    const res = await service.getStockForItems('branch-1', actor, ['I1']);

    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      itemId: 'I1',
      quantityOnHand: 0,
      defaultLocationId: '',
    });
    expect(res[0]!.locations).toEqual([]);
  });

  it('drops an item that is no longer sellable rather than faking a figure', async () => {
    // The CTE filters is_active / is_pos_visible, so a withdrawn item produces
    // no row. The caller leaves that cart line unknown, which keeps its
    // oversell warning on.
    query.mockResolvedValue([row()]);

    const res = await service.getStockForItems('branch-1', actor, ['I1', 'I2']);

    expect(res).toHaveLength(1);
    expect(res[0]!.itemId).toBe('I1');
  });

  it('folds the staged temp-warehouse delta into sellableQuantity', async () => {
    getBranchDelta.mockResolvedValue(new Map([['I1', 3]]));
    query.mockResolvedValue([row()]);

    const res = await service.getStockForItems('branch-1', actor, ['I1']);

    expect(res[0]).toMatchObject({ sellableQuantity: 7, quantityOnHand: 4 });
  });

  it('reads the staged delta once, scoped to the branch and organization', async () => {
    await service.getStockForItems('branch-1', actor, ['I1', 'I2']);

    expect(getBranchDelta).toHaveBeenCalledTimes(1);
    expect(getBranchDelta).toHaveBeenCalledWith('branch-1', 'org-1');
  });

  it('gives the same sellableQuantity as the exact-match path', async () => {
    // AC-07: both go through aggregateStockRows with the same staged delta, so
    // the oversell warning cannot disagree with itself depending on which
    // endpoint filled the number in.
    getBranchDelta.mockResolvedValue(new Map([['I1', 2]]));
    query.mockResolvedValue([row()]);

    const viaStock = await service.getStockForItems('branch-1', actor, ['I1']);
    const viaLookup = await service.lookupByCode('branch-1', actor, 'SKU-1');

    expect(viaStock[0]!.sellableQuantity).toBe(viaLookup[0]!.sellableQuantity);
  });
});
