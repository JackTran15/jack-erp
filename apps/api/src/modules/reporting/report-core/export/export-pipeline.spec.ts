import {
  DocumentColumn,
  InvoiceReportResult,
  ReportColumnDataType,
  ReportRow,
} from '@erp/shared-interfaces';
import { Writable } from 'stream';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ReportDefinition } from '../report-definition';
import { ExportPipeline } from './export-pipeline';
import {
  ExportDocumentHeader,
  ExportFetcher,
  ExportSink,
  ExportWriter,
  PushRows,
} from './export.types';
import { SingleShotFetcher } from './single-shot.fetcher';

const HEADER: ExportDocumentHeader = {
  title: 'Tổng hợp nhập xuất tồn kho',
  branch: null,
  subtitleLines: [],
};

const COLUMNS: DocumentColumn[] = [
  { col: 'sku', label: 'Mã SKU', type: ReportColumnDataType.STRING },
  { col: 'qty', label: 'Số lượng', type: ReportColumnDataType.NUMBER },
];

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

/** Records the order of every call so the contract can be asserted as a sequence. */
function makeWriter(calls: string[]): ExportWriter {
  return {
    begin: jest.fn(async () => {
      calls.push('begin');
    }),
    rows: jest.fn(async (rows: ReportRow[]) => {
      calls.push(`rows:${rows.length}`);
    }),
    end: jest.fn(async () => {
      calls.push('end');
    }),
  };
}

function makeSink(calls: string[]): ExportSink {
  const target = new Writable({ write: (_c, _e, cb) => cb() });
  return {
    stream: () => target,
    finalize: jest.fn(async () => {
      calls.push('finalize');
    }),
  };
}

/** A fetcher that pushes the given batches, then reports the given totals. */
function fetcherOf(
  batches: ReportRow[][],
  totals: ReportRow | null = null,
): ExportFetcher {
  return {
    drain: async (push: PushRows) => {
      for (const batch of batches) await push(batch);
      return totals;
    },
  };
}

describe('ExportPipeline', () => {
  it('opens the writer, drains, then closes writer and sink in order', async () => {
    const calls: string[] = [];
    const writer = makeWriter(calls);
    const sink = makeSink(calls);
    const pipeline = new ExportPipeline(
      fetcherOf([[{ sku: 'A', qty: 1 }]], { sku: null, qty: 1 }),
      writer,
      sink,
    );

    await pipeline.run(HEADER, COLUMNS);

    expect(calls).toEqual(['begin', 'rows:1', 'end', 'finalize']);
    expect(writer.end).toHaveBeenCalledWith({ sku: null, qty: 1 });
  });

  it('writes the sink stream and the column list into begin', async () => {
    const calls: string[] = [];
    const writer = makeWriter(calls);
    const sink = makeSink(calls);

    await new ExportPipeline(fetcherOf([]), writer, sink).run(HEADER, COLUMNS);

    expect(writer.begin).toHaveBeenCalledWith(sink.stream(), HEADER, COLUMNS);
  });

  it('forwards every batch in push order', async () => {
    const calls: string[] = [];
    const writer = makeWriter(calls);
    const batches = [
      [{ sku: 'A' }, { sku: 'B' }],
      [{ sku: 'C' }],
      [{ sku: 'D' }, { sku: 'E' }, { sku: 'F' }],
    ];

    await new ExportPipeline(fetcherOf(batches), writer, makeSink(calls)).run(
      HEADER,
      COLUMNS,
    );

    expect(calls).toEqual([
      'begin',
      'rows:2',
      'rows:1',
      'rows:3',
      'end',
      'finalize',
    ]);
    expect((writer.rows as jest.Mock).mock.calls.map(([r]) => r)).toEqual(
      batches,
    );
  });

  it('returns the number of data rows written, for the export log', async () => {
    const calls: string[] = [];
    const written = await new ExportPipeline(
      fetcherOf([[{ sku: 'A' }, { sku: 'B' }], [{ sku: 'C' }]]),
      makeWriter(calls),
      makeSink(calls),
    ).run(HEADER, COLUMNS);

    expect(written).toBe(3);
  });

  it('does not finalize the sink when the fetcher fails', async () => {
    const calls: string[] = [];
    const writer = makeWriter(calls);
    const sink = makeSink(calls);
    const failing: ExportFetcher = {
      drain: async () => {
        throw new Error('partition drain failed');
      },
    };

    await expect(
      new ExportPipeline(failing, writer, sink).run(HEADER, COLUMNS),
    ).rejects.toThrow('partition drain failed');

    // A finalized sink means "this file is complete" — a half-drained export
    // must never look complete to whatever is downstream.
    expect(sink.finalize).not.toHaveBeenCalled();
    expect(writer.end).not.toHaveBeenCalled();
  });
});

describe('SingleShotFetcher', () => {
  const RESULT: InvoiceReportResult = {
    rows: [{ sku: 'A', qty: 2 }],
    totals: { sku: null, qty: 2 },
    total: 1,
  };

  function makeDefinition(result: InvoiceReportResult) {
    const buildData = jest.fn().mockResolvedValue(result);
    const definition = {
      key: 'stock-summary',
      buildColumns: jest.fn(),
      buildData,
    } as unknown as ReportDefinition<{ reportType: string }>;
    return { definition, buildData };
  }

  it('pushes the whole result set once and returns its totals', async () => {
    const { definition, buildData } = makeDefinition(RESULT);
    const pushed: ReportRow[][] = [];

    const totals = await new SingleShotFetcher(
      definition,
      { reportType: 'stock-summary' },
      actor,
      50_000,
    ).drain(async (rows) => {
      pushed.push(rows);
    });

    expect(pushed).toEqual([RESULT.rows]);
    expect(totals).toEqual(RESULT.totals);
    expect(buildData).toHaveBeenCalledWith(
      { reportType: 'stock-summary', page: 1, limit: 50_000 },
      actor,
    );
  });

  it('pushes nothing when the report has no rows', async () => {
    const { definition } = makeDefinition({ rows: [], totals: null, total: 0 });
    const push = jest.fn();

    const totals = await new SingleShotFetcher(
      definition,
      { reportType: 'stock-summary' },
      actor,
      50_000,
    ).drain(push);

    expect(push).not.toHaveBeenCalled();
    expect(totals).toBeNull();
  });
});
