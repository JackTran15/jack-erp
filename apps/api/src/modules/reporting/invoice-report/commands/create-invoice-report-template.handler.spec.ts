import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreateInvoiceReportTemplateHandler } from './create-invoice-report-template.handler';
import { CreateInvoiceReportTemplateCommand } from './create-invoice-report-template.command';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const actor = { userId: 'u1', organizationId: 'org-1', branchId: 'b1', roles: [] } as any;
const CATALOG = ['date', 'revenue.total', `payment.method.${ACC}`];

/** Fake ReportRegistry whose definition exposes `CATALOG` as its column catalog. */
function makeRegistry(cols: string[] = CATALOG, known = true): any {
  return {
    get: jest.fn(() =>
      known
        ? {
            buildColumns: jest.fn(async () =>
              cols.map((col) => ({
                col,
                name: col,
                desc: null,
                type: 'currency',
                group: null,
              })),
            ),
          }
        : undefined,
    ),
  };
}

function makeRepo(dup: boolean): any {
  return {
    findOne: jest.fn(async () => (dup ? { id: 'existing' } : null)),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({
      ...x,
      id: 't1',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    })),
  };
}

const col = (c: string, extra: Record<string, unknown> = {}) => ({
  col: c,
  visible: true,
  frozen: false,
  ...extra,
});

const cmd = (dto: Record<string, unknown>) =>
  new CreateInvoiceReportTemplateCommand(dto as any, actor);

describe('CreateInvoiceReportTemplateHandler', () => {
  it('rejects an unknown report type with 400', async () => {
    const handler = new CreateInvoiceReportTemplateHandler(
      makeRepo(false),
      makeRegistry(CATALOG, false),
    );
    await expect(
      handler.execute(
        cmd({ reportType: 'nope', name: 'T', columns: [col('date')] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a column outside the report-type catalog with 400', async () => {
    const handler = new CreateInvoiceReportTemplateHandler(
      makeRepo(false),
      makeRegistry(),
    );
    await expect(
      handler.execute(
        cmd({
          reportType: 'daily-sales-summary',
          name: 'T',
          columns: [col('date'), col('nope')],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a columnFilter referencing a non-catalog column with 400', async () => {
    const handler = new CreateInvoiceReportTemplateHandler(
      makeRepo(false),
      makeRegistry(),
    );
    await expect(
      handler.execute(
        cmd({
          reportType: 'daily-sales-summary',
          name: 'T',
          columns: [col('date')],
          columnFilters: [{ col: 'bogus', gte: 1 }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate column keys with 400', async () => {
    const handler = new CreateInvoiceReportTemplateHandler(
      makeRepo(false),
      makeRegistry(),
    );
    await expect(
      handler.execute(
        cmd({
          reportType: 'daily-sales-summary',
          name: 'T',
          columns: [col('date'), col('date')],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no column is visible with 400', async () => {
    const handler = new CreateInvoiceReportTemplateHandler(
      makeRepo(false),
      makeRegistry(),
    );
    await expect(
      handler.execute(
        cmd({
          reportType: 'daily-sales-summary',
          name: 'T',
          columns: [col('date', { visible: false })],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate name with 409', async () => {
    const handler = new CreateInvoiceReportTemplateHandler(
      makeRepo(true),
      makeRegistry(),
    );
    await expect(
      handler.execute(
        cmd({
          reportType: 'daily-sales-summary',
          name: 'T',
          columns: [col('date')],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists normalized records (order stamped, displayName trimmed) + columnFilters', async () => {
    const repo = makeRepo(false);
    const handler = new CreateInvoiceReportTemplateHandler(repo, makeRegistry());
    const view = await handler.execute(
      cmd({
        reportType: 'daily-sales-summary',
        name: 'Daily revenue',
        columns: [
          { col: 'date', visible: true, frozen: true, order: 9 },
          { col: 'revenue.total', displayName: '  Total Rev  ', visible: true, frozen: false },
          { col: `payment.method.${ACC}`, visible: false, frozen: false },
        ],
        filters: { issuedAt: { from: '2026-06-01' } },
        columnFilters: [{ col: 'revenue.total', gte: 1000 }],
      }),
    );
    expect(view.columns).toEqual([
      { col: 'date', displayName: null, visible: true, frozen: true, order: 0 },
      { col: 'revenue.total', displayName: 'Total Rev', visible: true, frozen: false, order: 1 },
      { col: `payment.method.${ACC}`, displayName: null, visible: false, frozen: false, order: 2 },
    ]);
    expect(view.columnFilters).toEqual([{ col: 'revenue.total', gte: 1000 }]);

    const saved = repo.save.mock.calls[0][0];
    expect(saved.organizationId).toBe('org-1');
    expect(saved.createdBy).toBe('u1');
    expect(saved.filters.columnFilters).toEqual([{ col: 'revenue.total', gte: 1000 }]);
  });
});
