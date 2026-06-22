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
});
