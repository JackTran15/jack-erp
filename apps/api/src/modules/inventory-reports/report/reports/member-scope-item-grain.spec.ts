import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { DocumentDetailReport } from './document-detail.report';
import { StockByStorePivotReport } from './stock-by-store-pivot.report';
import { StockQuantityDetailReport } from './stock-quantity-detail.report';
import { StockSummaryByStoreReport } from './stock-summary-by-store.report';
import { StockSummaryReport } from './stock-summary.report';
import { TempWarehouseOutReport } from './temp-warehouse-out.report';
import { TransferByStoreReport } from './transfer-by-store.report';

/**
 * Where the filter bar's unit/brand end up, across all five reports that offer
 * "Thống kê theo".
 *
 * ADR-02 moved these two out of the shared `columnFilters` bag and into a
 * `memberScope` of their own. The assertions below were written against the old
 * transport first and passed on unchanged code (T-02-01); they now read the new
 * one. What they guard is unchanged either way: **every** report hands both
 * values to its engine, none of them drops one on the floor, and a grid filter
 * on the same column still stands alongside the dropdown rather than replacing
 * it.
 *
 * The split is the whole point. `columnFilters` narrows the rows a report has
 * already produced; `memberScope` decides which items are summed in the first
 * place. At the item grain those coincide, which is why the old shape worked
 * here and nowhere else.
 *
 * `countRows` is the entry point because all five build their engine query
 * through the same private helper `buildData` uses, without dragging row
 * projection, location lookups or branch pivots into the assertion.
 */

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchIds: ['branch-1'],
  roles: [],
} as unknown as ActorContext;

const EMPTY_REPO = { find: jest.fn().mockResolvedValue([]) };

/** An engine stub that records the query and answers an empty page. */
function engine() {
  return {
    aggregate: jest.fn().mockResolvedValue({ data: [], total: 0, totals: {} }),
    byBranch: jest.fn().mockResolvedValue({ data: [], total: 0, totals: {} }),
    list: jest.fn().mockResolvedValue({ data: [], total: 0, totals: {} }),
  };
}

function repos() {
  return {
    branches: {
      find: jest.fn().mockResolvedValue([]),
      // transfer-by-store checks the source branch belongs to the org.
      findOne: jest.fn().mockResolvedValue({ id: 'branch-1' }),
    },
    categories: { find: jest.fn().mockResolvedValue([]) },
    locations: { find: jest.fn().mockResolvedValue([]) },
    storages: { find: jest.fn().mockResolvedValue([]) },
    itemStorageLocations: { find: jest.fn().mockResolvedValue([]) },
    stockBalances: EMPTY_REPO,
  };
}

interface Subject {
  reportType: string;
  /** Filters this report refuses to run without, unrelated to unit/brand. */
  required?: Record<string, unknown>;
  /** Builds the report against the recording engine, and names the method it calls. */
  make: (e: ReturnType<typeof engine>) => ReportEntry;
  method: 'aggregate' | 'byBranch' | 'list';
  /**
   * `countRows` where it exists — it reaches the engine through the same query
   * builder without dragging row projection along. `document-detail` has none
   * (its export path is a keyset walk, not a count), so that one goes through
   * `buildData`.
   */
  entry?: 'countRows' | 'buildData';
}

interface ReportEntry {
  countRows?: (dto: InventoryReportSearchDto, a: ActorContext) => Promise<unknown>;
  buildData: (dto: InventoryReportSearchDto, a: ActorContext) => Promise<unknown>;
}

/** Calls whichever entry point the subject declares. */
function invoke(
  subject: Subject,
  report: ReportEntry,
  dto: InventoryReportSearchDto,
): Promise<unknown> {
  if (subject.entry === 'buildData' || !report.countRows) {
    return report.buildData(dto, actor);
  }
  return report.countRows(dto, actor);
}

const SUBJECTS: Subject[] = [
  {
    reportType: 'inventory-stock-summary',
    method: 'aggregate',
    make: (e) => {
      const r = repos();
      return new StockSummaryReport(
        e as never,
        r.branches as never,
        r.locations as never,
        r.storages as never,
        r.itemStorageLocations as never,
        r.stockBalances as never,
        r.categories as never,
      );
    },
  },
  {
    reportType: 'inventory-stock-quantity-detail',
    method: 'aggregate',
    make: (e) => {
      const r = repos();
      return new StockQuantityDetailReport(
        e as never,
        r.branches as never,
        r.locations as never,
        r.categories as never,
      );
    },
  },
  {
    reportType: 'inventory-stock-summary-by-store',
    method: 'aggregate',
    make: (e) => {
      const r = repos();
      return new StockSummaryByStoreReport(
        e as never,
        r.branches as never,
        r.categories as never,
      );
    },
  },
  {
    reportType: 'inventory-stock-by-store-pivot',
    method: 'aggregate',
    make: (e) => {
      const r = repos();
      return new StockByStorePivotReport(
        e as never,
        r.branches as never,
        r.categories as never,
      );
    },
  },
  {
    reportType: 'inventory-transfer-by-store',
    method: 'byBranch',
    // This one refuses a request with no source branch — "hàng đã điều chuyển
    // ĐI TỪ đâu" has no org-wide reading — so it has to be given one before the
    // unit/brand assertion can be reached at all.
    required: { sourceStoreId: 'branch-1' },
    make: (e) => {
      const r = repos();
      return new TransferByStoreReport(
        e as never,
        r.branches as never,
        r.categories as never,
      );
    },
  },
  // These two never passed the scope down at all: the value reached the report
  // and stopped there, while both engines already had SQL able to honour it.
  // They declare no unit/brand line on their own form, so a value only arrives
  // after the user set it on another report — which is precisely the case
  // AC-16 forbids answering with an unfiltered 201.
  {
    reportType: 'inventory-document-detail',
    method: 'list',
    entry: 'buildData',
    make: (e) => {
      const r = repos();
      return new DocumentDetailReport(
        e as never,
        r.branches as never,
        r.categories as never,
      );
    },
  },
  {
    reportType: 'inventory-temp-warehouse-out',
    method: 'list',
    make: (e) => {
      const r = repos();
      return new TempWarehouseOutReport(
        e as never,
        r.branches as never,
        r.categories as never,
      );
    },
  },
];

function dtoFor(
  subject: Subject,
  filters: Record<string, unknown>,
): InventoryReportSearchDto {
  return {
    reportType: subject.reportType,
    columns: ['sku', 'name'],
    filters: {
      period: { from: '2026-01-01', to: '2026-12-31' },
      statBy: 'item',
      ...subject.required,
      ...filters,
    },
  } as unknown as InventoryReportSearchDto;
}

describe('unit/brand travel as member scope, not column filters (AC-07)', () => {
  describe.each(SUBJECTS.map((s) => [s.reportType, s] as const))(
    '%s',
    (_name, subject) => {
      it('hands the unit dropdown to the engine as member scope', async () => {
        const e = engine();
        const report = subject.make(e);

        await invoke(subject, report, dtoFor(subject, { unit: 'Đôi' }));

        const [[query]] = e[subject.method].mock.calls;
        expect(query.memberScope.unit).toBe('Đôi');
      });

      it('hands the brand dropdown to the engine as member scope', async () => {
        const e = engine();
        const report = subject.make(e);

        await invoke(subject, report, dtoFor(subject, { brand: 'Lasta' }));

        const [[query]] = e[subject.method].mock.calls;
        expect(query.memberScope.brand).toBe('Lasta');
      });

      it('hands both down, and leaves the column filters empty', async () => {
        const e = engine();
        const report = subject.make(e);

        await invoke(
          subject,
          report,
          dtoFor(subject, { unit: 'Đôi', brand: 'Lasta' }),
        );

        const [[query]] = e[subject.method].mock.calls;
        expect(query.memberScope).toEqual({ unit: 'Đôi', brand: 'Lasta' });
        // The bar no longer writes into the grid's bag. This is the assertion
        // that would have caught the 400: an entry here needs a column spec,
        // and at the aggregate grains `unit` has none.
        expect(query.columnFilters).toEqual({});
      });

      it('scopes by neither when the dropdowns are untouched', async () => {
        const e = engine();
        const report = subject.make(e);

        await invoke(subject, report, dtoFor(subject, {}));

        const [[query]] = e[subject.method].mock.calls;
        expect(query.memberScope.unit).toBeUndefined();
        expect(query.memberScope.brand).toBeUndefined();
        expect(query.columnFilters).toEqual({});
      });

      it('keeps a grid filter on the same column alongside the dropdown', async () => {
        // Both constraints still hold; they simply reach SQL by different
        // doors now — one as a column predicate, one inside the member WHERE —
        // and AND together there.
        const e = engine();
        const report = subject.make(e);

        await invoke(subject, report, {
          ...dtoFor(subject, { unit: 'Đôi' }),
          columnFilters: [{ col: 'unit', contains: 'ô' }],
        } as unknown as InventoryReportSearchDto);

        const [[query]] = e[subject.method].mock.calls;
        expect(query.columnFilters.unit).toEqual({ operator: '*', value: 'ô' });
        expect(query.memberScope.unit).toBe('Đôi');
      });
    },
  );
});
