import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockBalancePivotRow } from '../../services/stock-balance-pivot.service';
import { StockByStorePivotReport } from './stock-by-store-pivot.report';

const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchIds: ['b1', 'b2'],
  roles: [],
} as unknown as ActorContext;

const ORG_BRANCHES = [
  { id: 'b1', name: 'CN Cần Thơ' },
  { id: 'b2', name: 'CN Đà Nẵng' },
];

const pivotRow: StockBalancePivotRow = {
  itemId: 'item-1',
  sku: 'SKU-1',
  name: 'Item 1',
  parentSku: null,
  parentName: null,
  unit: 'Đôi',
  categoryId: 'cat-1',
  categoryName: 'Nhóm A',
  brand: null,
  color: null,
  size: null,
  totalQty: 7,
  totalValue: 700,
  perBranch: {
    b1: { branchId: 'b1', branchName: 'CN Cần Thơ', qty: 7, value: 700 },
    // b2 has no stock for this item — must surface as 0, not undefined.
  },
};

function build(rows: StockBalancePivotRow[], orgBranches = ORG_BRANCHES) {
  const engine = {
    aggregate: jest
      .fn()
      .mockResolvedValue({ data: rows, branches: [], total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue(orgBranches) };
  return new StockByStorePivotReport(engine as never, branches as never);
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-stock-by-store-pivot',
  columns: ['sku', 'total', 'branch.qty.b1', 'branch.qty.b2'],
  filters: {},
};

describe('StockByStorePivotReport', () => {
  it('emits one dynamic column per org branch in the catalog', async () => {
    const cols = await build([]).buildColumns(actor);
    const dynamic = cols.filter((c) => c.col.startsWith('branch.qty.'));
    expect(dynamic.map((c) => c.col)).toEqual(['branch.qty.b1', 'branch.qty.b2']);
    expect(dynamic[0].name).toBe('CN Cần Thơ');
    expect(dynamic[0].group).toEqual({ id: 'perBranch', name: 'Tồn theo cửa hàng' });
    expect(dynamic[0].filterKind).toBe('number');
  });

  it('maps perBranch cells into dynamic keys (missing branch → 0) and totals them', async () => {
    const result = await build([pivotRow]).buildData(dto, actor);
    expect(result.rows[0]).toEqual({
      sku: 'SKU-1',
      total: 7,
      'branch.qty.b1': 7,
      'branch.qty.b2': 0,
    });
    expect(result.totals!['branch.qty.b1']).toBe(7);
    expect(result.totals!['branch.qty.b2']).toBe(0);
  });

  it('rejects dynamic keys of branches outside the org', async () => {
    const report = build([pivotRow]);
    await expect(
      report.buildData(
        { ...dto, columns: ['sku', 'branch.qty.foreign'] },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('restricts the branch catalog to the actor branch permissions', async () => {
    const engine = {
      aggregate: jest.fn().mockResolvedValue({ data: [], branches: [], total: 0 }),
    };
    const branches = { find: jest.fn().mockResolvedValue([]) };
    const report = new StockByStorePivotReport(engine as never, branches as never);

    await report.buildColumns(actor);
    expect(branches.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );

    // No permitted branches → no dynamic columns, no branch lookup at all.
    const noAccess = { ...actor, branchIds: [] } as unknown as ActorContext;
    branches.find.mockClear();
    const cols = await report.buildColumns(noAccess);
    expect(cols.some((c) => c.col.startsWith('branch.qty.'))).toBe(false);
    expect(branches.find).not.toHaveBeenCalled();
  });
});
