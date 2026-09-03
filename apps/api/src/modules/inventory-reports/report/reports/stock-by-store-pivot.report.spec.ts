import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockBalancePivotRow } from '../../services/stock-balance-pivot.service';
import { StockByStorePivotReport } from './stock-by-store-pivot.report';
import {
  permittedBranchIds,
  resolveInventoryBranchIds,
} from '../report-scope.util';

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
    new StockByStorePivotReport(engine as never, branches as never),
    { engine, branchRepo: branches },
  ) as StockByStorePivotReport & {
    engine: { aggregate: jest.Mock };
    branchRepo: { find: jest.Mock };
  };
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

  it('scopes the branch catalog by organization only, never by assignment (ADR-04)', async () => {
    const engine = {
      aggregate: jest
        .fn()
        .mockResolvedValue({ data: [], branches: [], total: 0, totals: { total: 0 } }),
    };
    const branches = { find: jest.fn().mockResolvedValue(ORG_BRANCHES) };
    const report = new StockByStorePivotReport(engine as never, branches as never);

    await report.buildColumns(actor);
    const where = branches.find.mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    // The `id: In([...assigned])` clause is what ADR-04 removed. Asserting its absence is
    // the only way this test fails if someone re-clamps the report to `actor.branchIds`.
    expect(where).not.toHaveProperty('id');

    // An actor assigned to nothing still sees every branch of its organization.
    const unassigned = { ...actor, branchIds: [] } as unknown as ActorContext;
    branches.find.mockClear();
    const cols = await report.buildColumns(unassigned);
    expect(cols.filter((c) => c.col.startsWith('branch.qty.')).map((c) => c.col)).toEqual([
      'branch.qty.b1',
      'branch.qty.b2',
    ]);
    expect(branches.find).toHaveBeenCalled();
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

/**
 * ADR-04 — chủ dự án chốt 03/09/2026: riêng báo cáo này, mọi vai trò mở được đều xem toàn bộ
 * chi nhánh của tổ chức. Đây là NỚI phạm vi, không phải siết, nên các ca dưới đây tồn tại để
 * bất kỳ ai kẹp lại theo `actor.branchIds` sẽ làm đỏ ngay.
 */
describe('StockByStorePivotReport — phạm vi org-wide (ADR-04)', () => {
  /** Actor chỉ được gán 1 trong 2 chi nhánh của tổ chức. */
  const oneBranchActor = {
    userId: 'u-bm',
    organizationId: 'org-1',
    branchIds: ['b1'],
    branchId: 'b1',
    roles: [],
  } as unknown as ActorContext;

  /**
   * `build()` trả ORG_BRANCHES cho mọi truy vấn, nên nó không mô phỏng được nhánh
   * `resolveOrgWideBranchIds` đối chiếu `owned.length !== ids.length`. Hàm này cho mock lọc
   * theo đúng toán tử `In` được truyền vào, giống hành vi thật của TypeORM.
   */
  function buildFiltering() {
    const engine = {
      aggregate: jest
        .fn()
        .mockResolvedValue({ data: [], branches: [], total: 0, totals: { total: 0 } }),
    };
    const branches = {
      find: jest.fn().mockImplementation(({ where }) => {
        const requested: string[] | undefined = (where?.id as any)?.value;
        return Promise.resolve(
          requested
            ? ORG_BRANCHES.filter((b) => requested.includes(b.id))
            : ORG_BRANCHES,
        );
      }),
    };
    const report = new StockByStorePivotReport(engine as never, branches as never);
    return { report, engine, branches };
  }

  const plainDto: InventoryReportSearchDto = {
    reportType: 'inventory-stock-by-store-pivot',
    columns: ['sku', 'total'],
    filters: {},
  };

  it('AC-01 — actor gán 1 chi nhánh vẫn thấy cột của cả tổ chức', async () => {
    const report = build([]);

    const cols = await report.buildColumns(oneBranchActor);

    expect(
      cols.filter((c) => c.col.startsWith('branch.qty.')).map((c) => c.col),
    ).toEqual(['branch.qty.b1', 'branch.qty.b2']);
  });

  it('AC-02 — engine không nhận điều kiện chi nhánh nào khi không lọc cửa hàng', async () => {
    const report = build([]);

    await report.buildData(plainDto, oneBranchActor);

    expect(report.engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ branchIds: undefined }),
    );
  });

  it('AC-02 — đường xuất khẩu (countRows) cũng org-wide', async () => {
    const report = build([]);

    await report.countRows(plainDto, oneBranchActor);

    expect(report.engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ branchIds: undefined, page: 1, pageSize: 1 }),
    );
  });

  it('AC-03 — organizationId vẫn là ranh giới cứng ở cả hai truy vấn', async () => {
    const report = build([]);

    await report.buildData(plainDto, oneBranchActor);

    expect(report.branchRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
    expect(report.engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
    );
  });

  it('AC-04 — lọc sang chi nhánh KHÔNG được gán là hợp lệ, không còn 403', async () => {
    const { report, engine } = buildFiltering();

    await report.buildData(
      { ...plainDto, filters: { store: { scope: 'group', storeIds: ['b2'] } } },
      oneBranchActor,
    );

    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ branchIds: ['b2'] }),
    );
  });

  it('AC-04 — id ngoài tổ chức vẫn bị chặn 400', async () => {
    const { report } = buildFiltering();

    await expect(
      report.buildData(
        { ...plainDto, filters: { store: { scope: 'group', storeIds: ['b9'] } } },
        oneBranchActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('AC-05 — không còn phân biệt theo quyền: hai actor khác vai trò cho cùng kết quả', async () => {
    const chainActor = { ...oneBranchActor, userId: 'u-admin', branchIds: ['b1', 'b2'] } as ActorContext;

    const a = await build([]).buildColumns(oneBranchActor);
    const b = await build([]).buildColumns(chainActor);

    expect(a.map((c) => c.col)).toEqual(b.map((c) => c.col));
  });
});

/**
 * AC-09 — việc nới ở trên KHÔNG được lan sang helper dùng chung: 4 report definition khác
 * vẫn kẹp theo `actor.branchIds`, và tập rỗng vẫn phải thành "không có dữ liệu", không phải
 * "không lọc gì".
 */
describe('report-scope.util — helper dùng chung không đổi (AC-09)', () => {
  it('permittedBranchIds vẫn đọc actor.branchIds', () => {
    expect([...permittedBranchIds({ branchIds: ['x', 'y'] } as never)]).toEqual(['x', 'y']);
  });

  it('resolveInventoryBranchIds vẫn trả NO_ACCESS khi actor không có chi nhánh nào', async () => {
    const branches = { find: jest.fn() };
    await expect(
      resolveInventoryBranchIds(branches as never, undefined, { branchIds: [] } as never),
    ).resolves.toEqual(['00000000-0000-0000-0000-000000000000']);
  });
});
