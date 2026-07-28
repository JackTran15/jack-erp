import {
  InvoiceReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
} from '@erp/shared-interfaces';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { ReportDefinition, ReportRegistry } from './report-definition';
import {
  EXPORT_ROW_LIMIT,
  ReportExportRequest,
  ReportExportService,
} from './report-export.service';

const header = (
  col: string,
  name: string,
  type = ReportColumnDataType.STRING,
): ReportColumnHeader => ({
  col,
  name,
  desc: null,
  type,
  group: null,
  filterKind: 'text',
});

const CATALOG: ReportColumnHeader[] = [
  header('sku', 'Mã SKU'),
  header('name', 'Tên hàng hóa'),
  header('qty', 'Số lượng', ReportColumnDataType.NUMBER),
];

const RESULT: InvoiceReportResult = {
  rows: [{ sku: 'SKU-1', name: 'Giày A', qty: 3 }],
  totals: { sku: null, name: null, qty: 3 },
  total: 1,
};

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function makeService(branch: Partial<BranchEntity> | null = null) {
  const branchRepo = {
    findOne: jest.fn().mockResolvedValue(branch),
  } as unknown as Repository<BranchEntity>;
  return { service: new ReportExportService(branchRepo), branchRepo };
}

function makeRegistry(
  buildData = jest.fn().mockResolvedValue(RESULT),
  buildColumns = jest.fn().mockResolvedValue(CATALOG),
) {
  const definition = {
    key: 'stock-summary',
    buildColumns,
    buildData,
  } as unknown as ReportDefinition<ReportExportRequest>;
  return {
    registry: new ReportRegistry<ReportDefinition<ReportExportRequest>>([
      definition,
    ]),
    buildData,
    buildColumns,
  };
}

const dto = (over: Partial<ReportExportRequest> = {}): ReportExportRequest => ({
  reportType: 'stock-summary',
  columns: ['sku', 'qty'],
  ...over,
});

const context = { title: 'TỔNG HỢP TỒN KHO', subtitleLines: ['Tháng 7'] };

describe('ReportExportService.buildPayload', () => {
  it('rejects an unregistered report type', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    await expect(
      service.buildPayload(registry, dto({ reportType: 'nope' }), actor, context),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects column keys absent from the resolved catalog, naming them', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    await expect(
      service.buildPayload(
        registry,
        dto({ columns: ['sku', 'ghost', 'phantom'] }),
        actor,
        context,
      ),
    ).rejects.toThrow(/ghost, phantom/);
  });

  it('accepts dynamic columns the catalog resolves for this actor', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry(
      jest.fn().mockResolvedValue(RESULT),
      jest.fn().mockResolvedValue([...CATALOG, header('branch.qty.b1', 'CN 1')]),
    );

    const payload = await service.buildPayload(
      registry,
      dto({ columns: ['sku', 'branch.qty.b1'] }),
      actor,
      context,
    );

    expect(payload.columns.map((c) => c.col)).toEqual(['sku', 'branch.qty.b1']);
  });

  it('calls buildData exactly once, with the full-result limit', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeRegistry();

    await service.buildPayload(registry, dto(), actor, context);

    expect(buildData).toHaveBeenCalledTimes(1);
    expect(buildData).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: EXPORT_ROW_LIMIT }),
      actor,
    );
  });

  it('prefers a user-renamed label and falls back to the catalog name', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    const payload = await service.buildPayload(
      registry,
      dto({ columnLabels: { qty: 'SL tồn cuối' } }),
      actor,
      context,
    );

    expect(payload.columns).toEqual([
      expect.objectContaining({ col: 'sku', label: 'Mã SKU', align: 'left' }),
      expect.objectContaining({ col: 'qty', label: 'SL tồn cuối', align: 'right' }),
    ]);
  });

  it('keeps the column order the request asked for', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    const payload = await service.buildPayload(
      registry,
      dto({ columns: ['qty', 'name', 'sku'] }),
      actor,
      context,
    );

    expect(payload.columns.map((c) => c.col)).toEqual(['qty', 'name', 'sku']);
  });

  it('passes totals through untouched instead of recomputing them', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    const payload = await service.buildPayload(registry, dto(), actor, context);

    expect(payload.totals).toBe(RESULT.totals);
    // Rows are now accumulated from the fetcher's batches, so this is a new
    // array holding the same rows — identity of the array itself is not part
    // of the contract, the content is.
    expect(payload.rows).toEqual(RESULT.rows);
  });

  it('lets a row-cap failure from buildData propagate', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry(
      jest
        .fn()
        .mockRejectedValue(new BadRequestException('Report exceeds 50000 rows')),
    );

    await expect(
      service.buildPayload(registry, dto(), actor, context),
    ).rejects.toThrow(/exceeds 50000 rows/);
  });

  it('fills the branch block from the actor branch', async () => {
    const { service, branchRepo } = makeService({
      name: 'CN Quận 1',
      address: '12 Lê Lợi',
      phone: '0900000000',
    });
    const { registry } = makeRegistry();

    const payload = await service.buildPayload(registry, dto(), actor, context);

    expect(payload.branch).toEqual({
      name: 'CN Quận 1',
      address: '12 Lê Lợi',
      phone: '0900000000',
    });
    expect(branchRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'branch-1', organizationId: 'org-1' },
    });
  });

  it('leaves the branch null for a chain-wide actor', async () => {
    const { service, branchRepo } = makeService();
    const { registry } = makeRegistry();

    const payload = await service.buildPayload(
      registry,
      dto(),
      { ...actor, branchId: undefined },
      context,
    );

    expect(payload.branch).toBeNull();
    expect(branchRepo.findOne).not.toHaveBeenCalled();
  });

  it('carries the caller-supplied title and subtitles', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    const payload = await service.buildPayload(registry, dto(), actor, context);

    expect(payload.title).toBe('TỔNG HỢP TỒN KHO');
    expect(payload.subtitleLines).toEqual(['Tháng 7']);
  });
});

describe('ReportExportService.prepareExport — row cap', () => {
  function makeCountingRegistry(total: number, subject = 'invoices') {
    const buildData = jest.fn().mockResolvedValue(RESULT);
    const countRows = jest.fn().mockResolvedValue({ total, subject });
    const definition = {
      key: 'stock-summary',
      buildColumns: jest.fn().mockResolvedValue(CATALOG),
      buildData,
      countRows,
    } as unknown as ReportDefinition<ReportExportRequest>;
    return {
      registry: new ReportRegistry<ReportDefinition<ReportExportRequest>>([
        definition,
      ]),
      buildData,
      countRows,
    };
  }

  it('refuses over the cap without calling buildData', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeCountingRegistry(50_001);

    await expect(
      service.prepareExport(registry, dto(), actor, context),
    ).rejects.toThrow(/exceeds 50000 invoices \(50001\)/);
    // The whole point: nothing was materialized, and the caller can still
    // answer 400 because no byte of the response has been sent.
    expect(buildData).not.toHaveBeenCalled();
  });

  it('lets exactly the cap through', async () => {
    const { service } = makeService();
    const { registry, countRows } = makeCountingRegistry(50_000);

    await expect(
      service.prepareExport(registry, dto(), actor, context),
    ).resolves.toBeDefined();
    expect(countRows).toHaveBeenCalledWith(
      expect.objectContaining({ reportType: 'stock-summary' }),
      actor,
    );
  });

  it('names what it counted in the error', async () => {
    const { service } = makeService();
    const { registry } = makeCountingRegistry(60_000, 'customers');

    await expect(
      service.prepareExport(registry, dto(), actor, context),
    ).rejects.toThrow(/exceeds 50000 customers \(60000\)/);
  });

  it('skips the pre-flight check for a definition that cannot count', async () => {
    const { service } = makeService();
    const { registry } = makeRegistry();

    await expect(
      service.prepareExport(registry, dto(), actor, context),
    ).resolves.toBeDefined();
  });
});

describe('ReportExportService.prepareExport — fetcher choice', () => {
  function makeKeysetRegistry(
    page = jest.fn().mockResolvedValue({
      rows: [{ sku: 'SKU-1', qty: 1 }],
      nextCursor: null,
      hasMore: false,
    }),
  ) {
    const buildData = jest.fn().mockResolvedValue(RESULT);
    const countRows = jest.fn().mockResolvedValue({
      total: 90_000,
      subject: 'invoices',
    });
    const definition = {
      key: 'stock-summary',
      buildColumns: jest.fn().mockResolvedValue(CATALOG),
      buildData,
      countRows,
      exportSource: {
        range: (d: ReportExportRequest & { from?: string }) => ({
          from: '2026-01-01',
          to: '2026-01-31',
        }),
        summable: (cols: string[]) => cols.filter((c) => c === 'qty'),
        page,
      },
    } as unknown as ReportDefinition<ReportExportRequest>;
    return {
      registry: new ReportRegistry<ReportDefinition<ReportExportRequest>>([
        definition,
      ]),
      buildData,
      countRows,
      page,
    };
  }

  it('drains a keyset report by cursor instead of calling buildData', async () => {
    const { service } = makeService();
    const { registry, buildData, page } = makeKeysetRegistry();

    const prepared = await service.prepareExport(registry, dto(), actor, context);
    const rows: unknown[] = [];
    await prepared.fetcher.drain(async (batch) => {
      rows.push(...batch);
    });

    expect(buildData).not.toHaveBeenCalled();
    expect(page).toHaveBeenCalled();
    expect(rows).toHaveLength(5); // one row per partition window
  });

  it('splits the source range into windows', async () => {
    const { service } = makeService();
    const { registry, page } = makeKeysetRegistry();

    const prepared = await service.prepareExport(registry, dto(), actor, context);
    await prepared.fetcher.drain(async () => undefined);

    const windows = (page as jest.Mock).mock.calls.map(
      ([, , args]) => args.partition,
    );
    expect(windows).toHaveLength(5);
    // Newest first, tiling without gaps.
    for (let i = 0; i < windows.length - 1; i++) {
      expect(windows[i].from.getTime()).toBe(windows[i + 1].to.getTime());
    }
  });

  it('does not apply the row cap to a keyset report', async () => {
    const { service } = makeService();
    // countRows would say 90.000 — over the cap. A streamed report never holds
    // the whole set, so the cap has nothing to protect and must not fire.
    const { registry, countRows } = makeKeysetRegistry();

    await expect(
      service.prepareExport(registry, dto(), actor, context),
    ).resolves.toBeDefined();
    expect(countRows).not.toHaveBeenCalled();
  });

  it('leaves a report without exportSource on the single-shot path', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeRegistry();

    const prepared = await service.prepareExport(registry, dto(), actor, context);
    await prepared.fetcher.drain(async () => undefined);

    expect(buildData).toHaveBeenCalledTimes(1);
  });
});

describe('ReportExportService.prepareExport', () => {
  it('reads no rows while preparing', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeRegistry();

    const prepared = await service.prepareExport(registry, dto(), actor, context);

    // The whole point of ADR-08: the caller can still answer 4xx at this
    // moment, so nothing may have been fetched or written yet.
    expect(buildData).not.toHaveBeenCalled();
    expect(prepared.columns.map((c) => c.col)).toEqual(['sku', 'qty']);
  });

  it('rejects an unknown report before any fetch', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeRegistry();

    await expect(
      service.prepareExport(registry, dto({ reportType: 'nope' }), actor, context),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(buildData).not.toHaveBeenCalled();
  });

  it('rejects unknown columns before any fetch', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeRegistry();

    await expect(
      service.prepareExport(registry, dto({ columns: ['ghost'] }), actor, context),
    ).rejects.toThrow(/ghost/);
    expect(buildData).not.toHaveBeenCalled();
  });

  it('fetches the whole result set once when the fetcher is drained', async () => {
    const { service } = makeService();
    const { registry, buildData } = makeRegistry();

    const prepared = await service.prepareExport(registry, dto(), actor, context);
    const batches: unknown[][] = [];
    const totals = await prepared.fetcher.drain(async (rows) => {
      batches.push(rows);
    });

    expect(buildData).toHaveBeenCalledTimes(1);
    expect(buildData).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: EXPORT_ROW_LIMIT }),
      actor,
    );
    expect(batches).toEqual([RESULT.rows]);
    expect(totals).toBe(RESULT.totals);
  });
});
