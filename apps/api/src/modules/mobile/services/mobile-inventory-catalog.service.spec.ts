import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileInventoryCatalogService } from './mobile-inventory-catalog.service';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

describe('MobileInventoryCatalogService', () => {
  let service: MobileInventoryCatalogService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileInventoryCatalogService,
        { provide: getDataSourceToken(), useValue: { query } },
      ],
    }).compile();
    service = module.get(MobileInventoryCatalogService);
  });

  const sql = (): string => query.mock.calls[0][0] as string;
  const params = (): unknown[] => query.mock.calls[0][1] as unknown[];

  it('nhóm hàng: scope $1, chỉ ACTIVE, ba cột app cần, sắp theo mã rồi tên', async () => {
    await service.listCategories(actor);

    expect(params()).toEqual(['org-1']);
    expect(sql()).toContain('c.organization_id = $1');
    expect(sql()).toContain("c.status = 'ACTIVE'");
    expect(sql()).toContain('c.parent_group_id::text AS "parentId"');
    expect(sql()).toContain('ORDER BY c.code ASC NULLS LAST, c.name ASC, c.id ASC');
    expect(sql()).not.toContain('description');
  });

  it('đơn vị: từ items.unit, gộp không phân biệt hoa/thường, bỏ rỗng', async () => {
    await service.listUnits(actor);

    expect(params()).toEqual(['org-1']);
    expect(sql()).toContain('FROM items i');
    expect(sql()).toContain('GROUP BY lower(i.unit)');
    expect(sql()).toContain('lower(i.unit) AS code');
    expect(sql()).toContain('MIN(i.unit) AS name');
    expect(sql()).toContain("i.unit <> ''");
    expect(sql()).not.toContain('inventory_units');
  });
});
