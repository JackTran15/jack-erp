import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { TransferByBranchRow } from '../../services/transfer-report.service';
import { TransferByStoreReport } from './transfer-by-store.report';

// An empty category tree: these specs scope by branch and period, never by group,
// so `resolveDescendantCategoryIds` short-circuits on an absent `categoryId`.
const categories = { find: jest.fn().mockResolvedValue([]) };


const actorNoBranch = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;
const actorWithBranch = {
  ...actorNoBranch,
  branchId: 'b1',
  branchIds: ['b1'],
} as unknown as ActorContext;

const engineRow: TransferByBranchRow = {
  itemId: 'item-1',
  sku: 'SKU-1',
  itemName: 'Item 1',
  parentSku: null,
  parentName: null,
  unit: 'Cái',
  categoryId: 'cat-1',
  categoryName: 'Nhóm A',
  brand: null,
  color: null,
  size: null,
  destinationBranchId: 'b2',
  destinationBranchName: 'CN 2',
  outQty: 5,
  outAvgPrice: 100,
  outValue: 500,
  inQty: 5,
  inAvgPrice: 100,
  inValue: 500,
};

function build(rows: TransferByBranchRow[], ownedBranch = true, total = rows.length) {
  const engine = {
    // Stands in for SQL: one page, plus the whole-set count and totals. The two
    // average-price columns are absent on purpose — the engine never sums them.
    byBranch: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = {};
      for (const key of ['outQty', 'outValue', 'inQty', 'inValue'] as const) {
        totals[key] = rows.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
      }
      return Promise.resolve({ data: rows.slice(offset, offset + pageSize), total, totals });
    }),
  };
  const branches = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(ownedBranch ? { id: 'b1' } : null),
  };
  return {
    report: new TransferByStoreReport(engine as never, branches as never, categories as never),
    engine,
  };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-transfer-by-store',
  columns: ['sku', 'group', 'targetBranch', 'outQty', 'outAvgPrice', 'outValue'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('TransferByStoreReport', () => {
  it('400s when neither sourceStoreId nor actor branch is present', async () => {
    const { report } = build([]);
    await expect(report.buildData(dto, actorNoBranch)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('403s when the source store is outside the actor branch permissions', async () => {
    const { report } = build([]);
    await expect(
      report.buildData(
        { ...dto, filters: { ...dto.filters, sourceStoreId: 'b-foreign' } },
        actorWithBranch,
      ),
    ).rejects.toThrow('Access denied for stores: b-foreign');
  });

  it('defaults the source branch to the actor branch and maps group from categoryName', async () => {
    const { report, engine } = build([engineRow]);
    const result = await report.buildData(dto, actorWithBranch);
    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBranchId: 'b1' }),
    );
    expect(result.rows[0].group).toBe('Nhóm A');
    expect(result.rows[0].targetBranch).toBe('CN 2');
  });

  it('nulls average-price totals (non-additive)', async () => {
    const { report } = build([engineRow, { ...engineRow, outQty: 3, outValue: 300 }]);
    const result = await report.buildData(dto, actorWithBranch);
    expect(result.totals!.outQty).toBe(8);
    expect(result.totals!.outValue).toBe(800);
    expect(result.totals!.outAvgPrice).toBeNull();
  });

  it('answers a page of an over-cap organisation instead of refusing (AC-22)', async () => {
    const { report } = build([engineRow], true, 74_515);

    const result = await report.buildData({ ...dto, page: 1, limit: 50 }, actorWithBranch);

    expect(result.total).toBe(74_515);
    expect(result.rows).toHaveLength(1);
  });

  it('pushes page, limit and column filters down under their engine names', async () => {
    const { report, engine } = build([engineRow]);

    await report.buildData(
      {
        ...dto,
        page: 2,
        limit: 50,
        columnFilters: [
          { col: 'targetBranch', contains: 'Hà' },
          { col: 'name', contains: 'giày' },
          { col: 'group', equals: 'Giày nam' },
        ],
      },
      actorWithBranch,
    );

    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        columnFilters: {
          destinationBranchName: { operator: '*', value: 'Hà' },
          itemName: { operator: '*', value: 'giày' },
          categoryName: { operator: '=', value: 'Giày nam' },
        },
      }),
    );
  });

  it('pushes the unit and brand dropdowns down too', async () => {
    const { report, engine } = build([engineRow]);

    await report.buildData(
      { ...dto, filters: { ...dto.filters, unit: 'Đôi', brand: 'Bitis' } },
      actorWithBranch,
    );

    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: {
          unit: { operator: '=', value: 'Đôi' },
          brand: { operator: '=', value: 'Bitis' },
        },
      }),
    );
  });

  it('offers countRows so the export path keeps its cap (ADR-01)', async () => {
    const { report, engine } = build([engineRow], true, 74_515);

    await expect(report.countRows(dto, actorWithBranch)).resolves.toEqual({
      total: 74_515,
      subject: 'rows',
    });
    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 1 }),
    );
  });

  it('enforces the branch permission on the export path as well', async () => {
    // countRows is reached from /export. If the checks only lived in buildData,
    // an export could read a branch the caller has no access to.
    const { report } = build([engineRow]);

    await expect(
      report.countRows(
        { ...dto, filters: { ...dto.filters, sourceStoreId: 'branch-foreign' } },
        actorWithBranch,
      ),
    ).rejects.toThrow(/Access denied/);
  });
});
