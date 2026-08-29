import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockBalancePivotRow } from '../../services/stock-balance-pivot.service';
import { StockByStorePivotReport } from './stock-by-store-pivot.report';

// An empty category tree: these specs scope by branch and period, never by group,
// so `resolveDescendantCategoryIds` short-circuits on an absent `categoryId`.
const categories = { find: jest.fn().mockResolvedValue([]) };


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

function build(rows: StockBalancePivotRow[], orgBranches = ORG_BRANCHES, total = rows.length) {
  const engine = {
    // Stands in for SQL: one page, plus the whole-set count and totals. The
    // engine keys per-branch totals as `perBranch.<id>`, which is what the
    // report has to translate to the grid's `branch.qty.<id>`.
    aggregate: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = { total: 0 };
      for (const r of rows) {
        totals.total += Number(r.totalQty ?? 0);
        for (const [id, cell] of Object.entries(r.perBranch ?? {})) {
          totals[`perBranch.${id}`] =
            (totals[`perBranch.${id}`] ?? 0) + Number(cell?.qty ?? 0);
        }
      }
      return Promise.resolve({
        data: rows.slice(offset, offset + pageSize),
        branches: [],
        total,
        totals,
      });
    }),
  };
  const branches = { find: jest.fn().mockResolvedValue(orgBranches) };
  return Object.assign(
    new StockByStorePivotReport(engine as never, branches as never, categories as never),
    { engine },
  ) as StockByStorePivotReport & { engine: { aggregate: jest.Mock } };
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
      aggregate: jest
        .fn()
        .mockResolvedValue({ data: [], branches: [], total: 0, totals: { total: 0 } }),
    };
    const branches = { find: jest.fn().mockResolvedValue([]) };
    const report = new StockByStorePivotReport(engine as never, branches as never, categories as never);

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

  it('answers a page of an over-cap organisation instead of refusing (AC-22)', async () => {
    const report = build([pivotRow], ORG_BRANCHES, 74_515);

    const result = await report.buildData({ ...dto, page: 1, limit: 50 }, actor);

    expect(result.total).toBe(74_515);
  });

  it('pushes page, limit and column filters down', async () => {
    const report = build([pivotRow]);
    const engine = report.engine;

    await report.buildData(
      {
        ...dto,
        page: 2,
        limit: 50,
        columnFilters: [{ col: 'group', equals: 'Giày nam' }],
      },
      actor,
    );

    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        columnFilters: { group: { operator: '=', value: 'Giày nam' } },
      }),
    );
  });

  it('forwards a dynamic branch column filter untouched', async () => {
    // The engine turns the key into a correlated subquery; the report just has
    // to not mangle it on the way through.
    const report = build([pivotRow]);
    const engine = report.engine;

    await report.buildData(
      { ...dto, columnFilters: [{ col: 'branch.qty.b1', gt: 0 }] },
      actor,
    );

    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: { 'branch.qty.b1': { operator: '>', value: 0 } },
      }),
    );
  });

  it('offers countRows so the export path keeps its cap (ADR-01)', async () => {
    const report = build([pivotRow], ORG_BRANCHES, 74_515);
    const engine = report.engine;

    await expect(report.countRows(dto, actor)).resolves.toEqual({
      total: 74_515,
      subject: 'rows',
    });
    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 1 }),
    );
  });
});
