import {
  CASH_FUND_REPORT_KEYS,
  CASH_FUND_REPORT_TYPE_LABELS_VI,
  InvoiceReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { ExportPipeline } from '../../report-core/export/export-pipeline';
import { ExportWriter } from '../../report-core/export/export.types';
import { ReportExportService } from '../../report-core/report-export.service';
import { CashFundReportExportDto } from '../dto/cash-fund-report-export.dto';
import { ReportDefinition, ReportRegistry } from '../report-definition';
import {
  cashFundFilterSummary,
  cashFundReportLabel,
  GetCashFundReportDocumentHandler,
} from './get-cash-fund-report-document.handler';
import { GetCashFundReportDocumentQuery } from './get-cash-fund-report-document.query';

const SITUATION = CASH_FUND_REPORT_KEYS.CASH_IN_OUT_SITUATION;

const header = (
  col: string,
  name: string,
  type = ReportColumnDataType.STRING,
): ReportColumnHeader => ({ col, name, desc: null, type, group: null, filterKind: 'text' });

const CATALOG: ReportColumnHeader[] = [
  header('lineLabel', 'Chỉ tiêu'),
  header('amount', 'Số tiền', ReportColumnDataType.CURRENCY),
];

/** Three rows in the ADR-04 shape: a bold frame line, an indented child, a bold total. */
const ROWS: ReportRow[] = [
  { lineLabel: 'Tiền thu', amount: 300, rowKind: 'group', bold: 1, indentLevel: 0 },
  { lineLabel: 'Thu bán hàng', amount: 300, rowKind: 'detail', bold: 0, indentLevel: 1 },
  { lineLabel: 'Tiền cuối kỳ', amount: 300, rowKind: 'grandTotal', bold: 1, indentLevel: 0 },
];

const RESULT: InvoiceReportResult = {
  rows: ROWS,
  totals: { lineLabel: 'Tổng', amount: 300 },
  total: ROWS.length,
};

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function makeDefinition(over: Partial<ReportDefinition> = {}) {
  const buildData = jest.fn().mockResolvedValue(RESULT);
  const countRows = jest.fn().mockResolvedValue({ total: ROWS.length, subject: 'rows' });
  const definition = {
    key: SITUATION,
    buildColumns: jest.fn().mockResolvedValue(CATALOG),
    buildData,
    countRows,
    ...over,
  } as unknown as ReportDefinition;
  return { definition, buildData, countRows };
}

function makeHandler(definition: ReportDefinition) {
  const branchRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as Repository<BranchEntity>;
  const exportService = new ReportExportService(branchRepo);
  const registry = new ReportRegistry([definition]);
  return new GetCashFundReportDocumentHandler(registry, exportService);
}

const dto = (over: Partial<CashFundReportExportDto> = {}): CashFundReportExportDto =>
  ({
    reportType: SITUATION,
    columns: ['lineLabel', 'amount'],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' } },
    ...over,
  }) as CashFundReportExportDto;

describe('cashFundReportLabel', () => {
  it('returns the Vietnamese screen title for every cash-fund key', () => {
    for (const key of Object.values(CASH_FUND_REPORT_KEYS)) {
      expect(cashFundReportLabel(key)).toBe(CASH_FUND_REPORT_TYPE_LABELS_VI[key]);
    }
  });

  it('falls back to the raw key for an unknown report type', () => {
    expect(cashFundReportLabel('nope')).toBe('nope');
  });
});

describe('cashFundFilterSummary', () => {
  it('names the store scope and the employee filter without leaking ids', () => {
    const lines = cashFundFilterSummary({
      store: { scope: 'group', storeIds: ['b1'] },
      employeeIds: ['e1'],
    } as any);
    expect(lines).toEqual(['Xem theo cửa hàng: đã lọc; Nhân viên: đã lọc']);
  });

  it('says "Tất cả" for the all-stores scope', () => {
    expect(cashFundFilterSummary({ store: { scope: 'all', storeIds: [] } } as any)).toEqual([
      'Xem theo cửa hàng: Tất cả',
    ]);
  });

  it('produces no line when neither filter is active', () => {
    expect(cashFundFilterSummary({ branchId: 'b1' } as any)).toEqual([]);
    expect(cashFundFilterSummary(undefined)).toEqual([]);
  });
});

describe('GetCashFundReportDocumentHandler.execute', () => {
  it('titles the document with the upper-cased label and the period + filter subtitle (AC-20)', async () => {
    const { definition } = makeDefinition();
    const handler = makeHandler(definition);

    const prepared = await handler.execute(
      new GetCashFundReportDocumentQuery(
        dto({ filters: { period: { from: '2026-09-01', to: '2026-09-30' }, employeeIds: ['e1'] } as any }),
        actor,
      ),
    );

    expect(prepared.header.title).toBe('TÌNH HÌNH THU CHI');
    expect(prepared.header.subtitleLines).toEqual([
      'Từ ngày: 01/09/2026 Đến ngày: 30/09/2026',
      'Nhân viên: đã lọc',
    ]);
    expect(prepared.columns.map((c) => c.label)).toEqual(['Chỉ tiêu', 'Số tiền']);
  });

  it('goes single-shot and consults countRows when the definition has no exportSource', async () => {
    const { definition, buildData, countRows } = makeDefinition();
    const handler = makeHandler(definition);

    const prepared = await handler.execute(new GetCashFundReportDocumentQuery(dto(), actor));
    expect(countRows).toHaveBeenCalledTimes(1);
    expect(buildData).not.toHaveBeenCalled(); // nothing read while preparing

    const drained: ReportRow[] = [];
    const totals = await prepared.fetcher.drain(async (batch) => {
      drained.push(...batch);
    });
    expect(buildData).toHaveBeenCalledTimes(1);
    expect(drained).toEqual(ROWS);
    expect(totals).toEqual(RESULT.totals);
  });

  it('goes keyset (no buildData, no row cap) when the definition declares exportSource', async () => {
    const page = jest.fn().mockResolvedValue({
      rows: [ROWS[1]],
      nextCursor: null,
      hasMore: false,
    });
    const { definition, buildData, countRows } = makeDefinition({
      exportSource: {
        range: (d) => d.filters.period ?? null,
        summable: (cols) => cols.filter((c) => c === 'amount'),
        page,
      },
    });
    const handler = makeHandler(definition);

    const prepared = await handler.execute(new GetCashFundReportDocumentQuery(dto(), actor));
    await prepared.fetcher.drain(async () => undefined);

    expect(countRows).not.toHaveBeenCalled();
    expect(buildData).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalled();
  });

  it('carries bold / indentLevel through to the writer and the print payload (ADR-04)', async () => {
    const { definition } = makeDefinition();
    const handler = makeHandler(definition);
    const prepared = await handler.execute(new GetCashFundReportDocumentQuery(dto(), actor));

    // The export path: whatever the writer receives is what a bold-aware
    // renderer gets to read. The hidden keys are not columns, so they are
    // not projected away before this point.
    const written: ReportRow[] = [];
    const writer: ExportWriter = {
      begin: jest.fn(async () => undefined),
      rows: jest.fn(async (rows) => {
        written.push(...rows);
      }),
      end: jest.fn(async () => undefined),
    };
    const sink = { stream: () => ({}) as any, finalize: jest.fn(async () => undefined) };
    const count = await new ExportPipeline(prepared.fetcher, writer, sink).run(
      prepared.header,
      prepared.columns,
    );

    expect(count).toBe(3);
    expect(written.map((r) => r.bold)).toEqual([1, 0, 1]);
    expect(written.map((r) => r.indentLevel)).toEqual([0, 1, 0]);
    expect(writer.end).toHaveBeenCalledWith(RESULT.totals);

    // The print path materializes the same prepared export (AC-20).
    const again = await handler.execute(new GetCashFundReportDocumentQuery(dto(), actor));
    const payload = await new ReportExportService({
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<BranchEntity>).materialize(again);
    expect(payload).toMatchObject({
      title: 'TÌNH HÌNH THU CHI',
      totals: RESULT.totals,
    });
    expect(payload.rows.map((r) => r.bold)).toEqual([1, 0, 1]);
    expect(payload.columns.map((c) => c.col)).toEqual(['lineLabel', 'amount']);
  });
});
