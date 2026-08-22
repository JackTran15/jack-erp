import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
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

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: DataSource, useValue: { query } },
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

    expect(res[0].showroomQuantity).toBe(4);
    expect(res[0].quantityOnHand).toBe(12);
  });
});

describe('PosCatalogService.getCatalog', () => {
  let service: PosCatalogService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();

    service = module.get(PosCatalogService);
  });

  it('matches name, SKU code and barcode (ILIKE) via items-first LEFT JOIN', async () => {
    query.mockResolvedValue([]);

    await service.getCatalog('branch-1', actor, '893');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['org-1', 'branch-1', '%893%']);
    expect(sql).toContain('FROM items i');
    expect(sql).toContain('LEFT JOIN stock_balances sb');
    expect(sql).toContain('i.name ILIKE $3');
    expect(sql).toContain('i.code ILIKE $3');
    expect(sql).toContain('item_barcodes');
    expect(sql).toContain('b.code ILIKE $3');
    expect(sql).toContain('i.is_pos_visible = true');
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

  it('sums showroomQuantity from main-storage locations only', async () => {
    query.mockResolvedValue(bx140Rows);

    const res = await service.getCatalog('branch-1', actor);

    expect(res).toHaveLength(1);
    expect(res[0].showroomQuantity).toBe(4);
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
  // Showing it with showroomQuantity 0 is the point: warn, do not hide.
  it('keeps warehouse-only items in the result with showroomQuantity 0', async () => {
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
    expect(whOnly.showroomQuantity).toBe(0);
    expect(whOnly.quantityOnHand).toBe(7);
  });
});
