import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { ItemEntity } from '../../inventory/location/item.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { InventoryReportSearchDto } from '../dto/inventory-report-search.dto';
import { DocumentDetailReport } from './reports/document-detail.report';
import { StockByStorePivotReport } from './reports/stock-by-store-pivot.report';
import { StockQuantityDetailReport } from './reports/stock-quantity-detail.report';
import { StockSummaryByStoreReport } from './reports/stock-summary-by-store.report';
import { StockSummaryReport } from './reports/stock-summary.report';
import { TempWarehouseOutReport } from './reports/temp-warehouse-out.report';
import { TransferByStoreReport } from './reports/transfer-by-store.report';
import { TransferSummaryReport } from './reports/transfer-summary.report';
import { DocumentDetailService } from '../services/document-detail.service';
import { StockBalancePivotService } from '../services/stock-balance-pivot.service';
import { StockPeriodService } from '../services/stock-period.service';
import { TempWarehouseReportService } from '../services/temp-warehouse-report.service';
import { TransferReportService } from '../services/transfer-report.service';
import { InventoryReportDefinition } from './inventory-report-definition';

/**
 * Every column the grid draws a filter box for must compile into SQL.
 *
 * The catalog (`COLUMNS` in each report) and the spec table (`ReportColumnSpecs`
 * in each engine) are two hand-written lists in two files, with nothing binding
 * them together. When they drift, `buildReportColumnFilter` answers 400 —
 * "Cột X không hỗ trợ lọc trên báo cáo này" — while the grid keeps showing an
 * input, so typing in it produces an error toast instead of a filter. Nine
 * columns across three reports had drifted that way.
 *
 * The engines are driven for real over a DataSource that returns no rows: the
 * SQL never runs, but the filter compilation that raises the 400 does.
 */

const REPORTS = [
  StockSummaryReport,
  DocumentDetailReport,
  StockQuantityDetailReport,
  StockSummaryByStoreReport,
  StockByStorePivotReport,
  TransferSummaryReport,
  TransferByStoreReport,
  TempWarehouseOutReport,
];

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';

const actor: ActorContext = {
  userId: '33333333-3333-4333-8333-333333333333',
  organizationId: ORG,
  branchId: BRANCH,
  branchIds: [BRANCH],
  roles: [],
} as ActorContext;

function repoStub(rows: unknown[] = []) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(rows[0] ?? null),
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, unknown> = {};
      for (const m of [
        'select', 'addSelect', 'where', 'andWhere', 'leftJoin', 'innerJoin',
        'groupBy', 'addGroupBy', 'orderBy', 'limit', 'offset',
      ]) {
        qb[m] = () => qb;
      }
      qb.getRawMany = () => Promise.resolve([]);
      qb.getMany = () => Promise.resolve([]);
      return qb;
    }),
  };
}

async function buildReports(): Promise<InventoryReportDefinition[]> {
  const entities = [
    BranchEntity, ItemEntity, ItemCategoryEntity, LocationEntity,
    StorageEntity, ItemStorageLocationEntity, StockBalanceEntity,
  ];
  const moduleRef = await Test.createTestingModule({
    providers: [
      ...REPORTS,
      StockPeriodService,
      StockBalancePivotService,
      TransferReportService,
      DocumentDetailService,
      TempWarehouseReportService,
      { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ...entities.map((entity) => ({
        provide: getRepositoryToken(entity),
        // The branch scope resolver verifies the requested store really belongs
        // to the org, so the branch repository has to know about it.
        useValue: repoStub(
          entity === BranchEntity ? [{ id: BRANCH, name: 'Chi nhánh thử' }] : [],
        ),
      })),
    ],
  }).compile();

  return REPORTS.map((token) => moduleRef.get<InventoryReportDefinition>(token));
}

describe('inventory report column filterability', () => {
  let reports: InventoryReportDefinition[];

  beforeAll(async () => {
    reports = await buildReports();
  });

  it('covers every registered inventory report', () => {
    expect(reports).toHaveLength(8);
  });

  type Variant = {
    viewMode: 'single' | 'chain';
    statBy?: 'item' | 'parent' | 'group';
  };

  // A catalog depends on the view and on the "Thống kê theo" grain, and each
  // combination is a different column set — so each one is checked separately.
  const itemGrain: Variant[] = [{ viewMode: 'single' }, { viewMode: 'chain' }];

  // The parent and group grains re-aggregate in SQL and the engines drop most
  // column specs there, while the catalog keeps advertising the columns as
  // filterable — 91 column/grain combinations across five reports answer 400.
  // Kept as a live, failing expectation rather than a comment: it turns green
  // the moment the grain-aware specs land (UOW-05).
  const aggregateGrain: Variant[] = [
    { viewMode: 'single', statBy: 'parent' },
    { viewMode: 'single', statBy: 'group' },
  ];

  async function filterFailures(variant: Variant): Promise<string[]> {
    const failures: string[] = [];
    for (const report of reports) {
      const columns = await report.buildColumns(actor, variant);
      const ids = columns.map((c) => c.col);

      for (const column of columns) {
        if (column.filterKind === 'none') continue;

        const dto = {
          reportType: report.key,
          columns: ids,
          filters: {
            preset: 'this_month',
            viewMode: variant.viewMode,
            statBy: variant.statBy,
            store: { scope: 'group', storeIds: [BRANCH] },
          },
          columnFilters: [{ col: column.col, contains: 'x' }],
          page: 1,
          limit: 1,
        } as unknown as InventoryReportSearchDto;

        try {
          await report.buildData(dto, actor);
        } catch (error) {
          failures.push(
            `${report.key} [${JSON.stringify(variant)}] ${column.col}: ${(error as Error).message}`,
          );
        }
      }
    }
    return failures;
  }

  it.each(itemGrain)(
    'every filterable column compiles into SQL (%o)',
    async (variant) => {
      expect(await filterFailures(variant)).toEqual([]);
    },
  );

  it.each(aggregateGrain)(
    'every filterable column compiles into SQL at the %o grain',
    async (variant) => {
      expect(await filterFailures(variant)).toEqual([]);
    },
  );

  /**
   * The other direction: a column the grain fills must KEEP its filter box.
   *
   * Marking everything `filterKind: 'none'` would satisfy the test above while
   * quietly removing filtering the user had. These columns were measured against
   * real data (`evidence/probe-aggregate-grain-columns.txt`), so a regression that
   * hides one of them fails here.
   */
  const MUST_STAY_FILTERABLE: Array<[string, Variant, string[]]> = [
    ['inventory-stock-summary', { viewMode: 'single', statBy: 'parent' }, ['sku', 'name']],
    ['inventory-stock-summary', { viewMode: 'single', statBy: 'group' }, ['group']],
    ['inventory-stock-quantity-detail', { viewMode: 'single', statBy: 'parent' }, ['sku', 'name']],
    ['inventory-stock-summary-by-store', { viewMode: 'single', statBy: 'group' }, ['name', 'group']],
    ['inventory-stock-by-store-pivot', { viewMode: 'single', statBy: 'parent' }, ['sku', 'name', 'total']],
    ['inventory-transfer-by-store', { viewMode: 'single', statBy: 'group' }, ['sku', 'name', 'targetBranch']],
    ['inventory-stock-summary', { viewMode: 'single' }, ['sku', 'name', 'unit', 'brand', 'group']],
  ];

  it.each(MUST_STAY_FILTERABLE)(
    '%s keeps its filled columns filterable at %o',
    async (key, variant, expected) => {
      const report = reports.find((r) => r.key === key)!;
      const columns = await report.buildColumns(actor, variant);
      const filterable = columns
        .filter((c) => c.filterKind !== 'none')
        .map((c) => c.col);
      for (const col of expected) {
        expect(filterable).toContain(col);
      }
    },
  );

  it('rejects a filter on a column that carries no SQL expression', async () => {
    const report = reports.find((r) => r.key === 'inventory-document-detail')!;
    const columns = await report.buildColumns(actor, { viewMode: 'single' });
    const dto = {
      reportType: report.key,
      columns: columns.map((c) => c.col),
      filters: { preset: 'this_month', store: { scope: 'group', storeIds: [BRANCH] } },
      // `branchCode` is declared filterKind:'none' precisely because it has no
      // expression — a caller bypassing the grid must still get told.
      columnFilters: [{ col: 'branchCode', contains: 'x' }],
      page: 1,
      limit: 1,
    } as unknown as InventoryReportSearchDto;

    await expect(report.buildData(dto, actor)).rejects.toThrow(
      /không hỗ trợ lọc/,
    );
  });
});
