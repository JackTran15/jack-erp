import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  CompareOperator,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { ItemEntity } from '../item.entity';
import { SearchInventoryItemsV2Handler } from './search-inventory-items-v2.handler';
import { SearchInventoryItemsV2Query } from './search-inventory-items-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

// Two variants of product P1 + one orphan item.
const PRODUCT = { id: 'P1', code: 'GELLI', name: 'Giày Gelli' };
const items = [
  {
    id: 'i-1', productId: 'P1', product: PRODUCT, code: 'GELLI-39', name: 'Giày Gelli (39)',
    unit: 'đôi', brand: 'Acme', purchasePrice: '300000', sellingPrice: '500000',
    isActive: true, isPosVisible: true, barcodes: [{ code: 'B1' }],
  },
  {
    id: 'i-2', productId: 'P1', product: PRODUCT, code: 'GELLI-40', name: 'Giày Gelli (40)',
    unit: 'đôi', brand: 'Acme', purchasePrice: '400000', sellingPrice: '700000',
    isActive: true, isPosVisible: true, barcodes: [{ code: 'B2' }],
  },
  {
    id: 'i-3', productId: null, product: null, code: 'LAPTOP-15', name: 'Laptop 15',
    unit: 'pcs', brand: null, purchasePrice: '1000000', sellingPrice: '1500000',
    isActive: false, isPosVisible: true, barcodes: [],
  },
] as unknown as ItemEntity[];

describe('SearchInventoryItemsV2Handler', () => {
  let handler: SearchInventoryItemsV2Handler;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      getMany: jest.fn().mockResolvedValue(items),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchInventoryItemsV2Handler,
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();
    handler = module.get(SearchInventoryItemsV2Handler);
  });

  const run = (dto: Record<string, unknown>) =>
    handler.execute(new SearchInventoryItemsV2Query(dto, actor));

  it('groups variants per product, joins barcodes, averages prices, sorts code ASC, returns {data,total,page,limit}', async () => {
    const res = await run({});

    expect(qb.where).toHaveBeenCalledWith('item.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(res.total).toBe(2);
    expect(res).toMatchObject({ page: 1, limit: 20 });
    expect(res.data.map((r) => r.code)).toEqual(['GELLI', 'LAPTOP-15']);

    const gelli = res.data[0];
    expect(gelli).toMatchObject({
      type: 'product',
      id: 'P1',
      code: 'GELLI',
      name: 'Giày Gelli',
      barcode: 'B1, B2',
      unit: 'đôi',
      brand: 'Acme',
      purchasePrice: 350000,
      sellingPrice: 600000,
      isPosVisible: true,
      isActive: true,
      itemCount: 2,
    });

    const laptop = res.data[1];
    expect(laptop).toMatchObject({
      type: 'orphan',
      code: 'LAPTOP-15',
      barcode: '',
      brand: null,
      itemCount: 0,
      isActive: false,
    });
  });

  it('filters by barcode (contains)', async () => {
    const res = await run({ barcode: { operator: StringOperator.CONTAINS, value: 'B2' } });
    expect(res.data.map((r) => r.code)).toEqual(['GELLI']);
  });

  it('filters by brand (contains, case-insensitive)', async () => {
    const res = await run({ brand: { operator: StringOperator.CONTAINS, value: 'acme' } });
    expect(res.data.map((r) => r.code)).toEqual(['GELLI']);
  });

  it('filters by purchasePrice (<=) on the averaged value', async () => {
    const res = await run({ purchasePrice: { operator: CompareOperator.LTE, value: 350000 } });
    expect(res.data.map((r) => r.code)).toEqual(['GELLI']);
  });

  it('filters by isActive', async () => {
    const res = await run({ isActive: false });
    expect(res.data.map((r) => r.code)).toEqual(['LAPTOP-15']);
  });

  it('paginates', async () => {
    const p1 = await run({ page: 1, limit: 1 });
    expect(p1.data.map((r) => r.code)).toEqual(['GELLI']);
    expect(p1.total).toBe(2);
    const p2 = await run({ page: 2, limit: 1 });
    expect(p2.data.map((r) => r.code)).toEqual(['LAPTOP-15']);
  });
});
