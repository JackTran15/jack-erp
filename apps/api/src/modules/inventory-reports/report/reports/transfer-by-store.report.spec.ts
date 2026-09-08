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

  it('lets any store of the organization be the source, assigned or not', async () => {
    // Organization-wide under ADR-04: quantities may be compared across the
    // whole chain. `b-other` is a real branch of this org the actor is not
    // assigned to, and it must resolve rather than 403.
    const { report, engine } = build([engineRow]);
    await report.buildData(
      { ...dto, filters: { ...dto.filters, sourceStoreId: 'b-other' } },
      actorWithBranch,
    );
    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBranchId: 'b-other' }),
    );
  });

  it('400s when the source store belongs to another organization', async () => {
    const { report } = build([], false);
    await expect(
      report.buildData(
        { ...dto, filters: { ...dto.filters, sourceStoreId: 'b-foreign' } },
        actorWithBranch,
      ),
    ).rejects.toThrow('Unknown store ids: b-foreign');
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

  // ADR-02 moved these two out of `columnFilters` and into `memberScope`, on
  // purpose: they choose which items are summed, not which produced rows
  // survive, and only the item grain could pretend those were the same thing.
  it('pushes the unit and brand dropdowns down as member scope', async () => {
    const { report, engine } = build([engineRow]);

    await report.buildData(
      { ...dto, filters: { ...dto.filters, unit: 'Đôi', brand: 'Bitis' } },
      actorWithBranch,
    );

    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        memberScope: { unit: 'Đôi', brand: 'Bitis' },
        columnFilters: {},
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

  it('validates the source store on the export path as well', async () => {
    // countRows is reached from /export. If the checks only lived in buildData,
    // an export could read a branch of another organization.
    const { report } = build([engineRow], false);

    await expect(
      report.countRows(
        { ...dto, filters: { ...dto.filters, sourceStoreId: 'branch-foreign' } },
        actorWithBranch,
      ),
    ).rejects.toThrow(/Unknown store ids/);
  });
});

/**
 * Footer and paging describe the same set as the grid, at the aggregate grains.
 *
 * The SQL half of this is guarded in `transfer-report.service.spec.ts` (N4: the
 * count and the rows must read the same relations). What is left for the report
 * layer is the arithmetic on top of the engine's answer — the place where a
 * correct engine can still be reported wrongly.
 */
describe('TransferByStoreReport footer and paging (AC-08, AC-13, AC-14)', () => {
  const many: TransferByBranchRow[] = Array.from({ length: 7 }, (_, n) => ({
    ...engineRow,
    itemId: `item-${n}`,
    sku: `SKU-${n}`,
    outQty: n + 1,
    outValue: (n + 1) * 100,
    inQty: n + 1,
    inValue: (n + 1) * 100,
  }));

  const aggDto = (page: number, limit: number): InventoryReportSearchDto => ({
    ...dto,
    columns: ['sku', 'outQty', 'outValue'],
    filters: { ...dto.filters, statBy: 'group' },
    page,
    limit,
  } as unknown as InventoryReportSearchDto);

  it('reports a total that every row can actually be reached through', async () => {
    const { report } = build(many);
    const limit = 3;

    const first = await report.buildData(aggDto(1, limit), actorWithBranch);
    const pages = Math.ceil(first.total / limit);
    let walked = 0;
    let lastPageRows = 0;
    for (let page = 1; page <= pages; page += 1) {
      const result = await report.buildData(aggDto(page, limit), actorWithBranch);
      walked += result.rows.length;
      lastPageRows = result.rows.length;
    }

    expect(first.total).toBe(7);
    expect(walked).toBe(first.total);
    // AC-14: ceil(7/3) = 3 pages, and the third holds the remaining row.
    expect(pages).toBe(3);
    expect(lastPageRows).toBeGreaterThan(0);
  });

  it('keeps the footer describing the whole set, not the page in view', async () => {
    // The footer is the engine's whole-set aggregate, so page 3 of 3 must carry
    // the same totals as page 1. Summing the page instead would understate it
    // by exactly the rows the user cannot see.
    const { report } = build(many);

    const firstPage = await report.buildData(aggDto(1, 3), actorWithBranch);
    const lastPage = await report.buildData(aggDto(3, 3), actorWithBranch);

    expect(firstPage.totals!.outQty).toBe(28); // 1+2+…+7
    expect(lastPage.totals!.outQty).toBe(28);
    expect(lastPage.rows).toHaveLength(1);
  });

  it('passes the member scope to the engine at the aggregate grain (AC-06)', async () => {
    const { report, engine } = build(many);

    await report.buildData(
      {
        ...aggDto(1, 20),
        filters: { ...dto.filters, statBy: 'group', unit: 'Đôi' },
      } as unknown as InventoryReportSearchDto,
      actorWithBranch,
    );

    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        itemGroupBy: 'group',
        memberScope: { unit: 'Đôi', brand: undefined },
      }),
    );
  });

  it('never sums an average price into the footer', async () => {
    // `outAvgPrice` is the average of averages — a number with no meaning. The
    // engine does not aggregate it, and the footer must show null, not 0: zero
    // is a claim about the data that nobody made.
    const { report } = build(many);

    const result = await report.buildData(
      { ...dto, columns: ['sku', 'outAvgPrice', 'outQty'], page: 1, limit: 20 } as unknown as InventoryReportSearchDto,
      actorWithBranch,
    );

    expect(result.totals!.outAvgPrice).toBeNull();
    expect(result.totals!.outQty).toBe(28);
  });
});
