import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UpdateInvoiceReportTemplateHandler } from './update-invoice-report-template.handler';
import { UpdateInvoiceReportTemplateCommand } from './update-invoice-report-template.command';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const actor = { userId: 'u1', organizationId: 'org-1', branchId: 'b1', roles: [] } as any;
const CATALOG = ['date', 'revenue.total', `payment.method.${ACC}`];

function makeRegistry(cols: string[] = CATALOG): any {
  return {
    get: jest.fn(() => ({
      buildColumns: jest.fn(async () =>
        cols.map((col) => ({
          col,
          name: col,
          desc: null,
          type: 'currency',
          group: null,
        })),
      ),
    })),
  };
}

function entity(overrides: Record<string, unknown> = {}): any {
  return {
    id: 't1',
    organizationId: 'org-1',
    reportType: 'daily-sales-summary',
    name: 'T',
    description: null,
    columns: [{ col: 'date', displayName: null, visible: true, frozen: false, order: 0 }],
    filters: { issuedAt: { from: '2026-06-01' }, columnFilters: [] },
    sortOrder: 0,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function makeRepo(loaded: any, dupOnName = false): any {
  return {
    findOne: jest
      .fn()
      .mockResolvedValueOnce(loaded)
      .mockResolvedValue(dupOnName ? { id: 'other' } : null),
    save: jest.fn(async (x) => ({ ...x, updatedAt: new Date('2026-06-02T00:00:00Z') })),
  };
}

const col = (c: string, extra: Record<string, unknown> = {}) => ({
  col: c,
  visible: true,
  frozen: false,
  ...extra,
});
const cmd = (id: string, dto: Record<string, unknown>) =>
  new UpdateInvoiceReportTemplateCommand(id, dto as any, actor);

describe('UpdateInvoiceReportTemplateHandler', () => {
  it('throws 404 when the template does not exist', async () => {
    const handler = new UpdateInvoiceReportTemplateHandler(
      makeRepo(null),
      makeRegistry(),
    );
    await expect(
      handler.execute(cmd('missing', { name: 'X' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects columns outside the report-type catalog with 400', async () => {
    const handler = new UpdateInvoiceReportTemplateHandler(
      makeRepo(entity()),
      makeRegistry(),
    );
    await expect(
      handler.execute(cmd('t1', { columns: [col('date'), col('nope')] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a columnFilter outside the catalog with 400 (columns untouched)', async () => {
    const handler = new UpdateInvoiceReportTemplateHandler(
      makeRepo(entity()),
      makeRegistry(),
    );
    await expect(
      handler.execute(cmd('t1', { columnFilters: [{ col: 'bogus' }] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('full-replaces columns, stamping order from array position', async () => {
    const repo = makeRepo(entity());
    const handler = new UpdateInvoiceReportTemplateHandler(repo, makeRegistry());
    const view = await handler.execute(
      cmd('t1', {
        columns: [
          { col: 'revenue.total', displayName: 'Σ', visible: true, frozen: false, order: 5 },
          { col: 'date', visible: true, frozen: true },
        ],
      }),
    );
    expect(view.columns).toEqual([
      { col: 'revenue.total', displayName: 'Σ', visible: true, frozen: false, order: 0 },
      { col: 'date', displayName: null, visible: true, frozen: true, order: 1 },
    ]);
  });

  it('leaves columns untouched when the patch omits them', async () => {
    const loaded = entity();
    const repo = makeRepo(loaded);
    const handler = new UpdateInvoiceReportTemplateHandler(repo, makeRegistry());
    await handler.execute(cmd('t1', { sortOrder: 7 }));
    const saved = repo.save.mock.calls[0][0];
    expect(saved.columns).toEqual(loaded.columns);
    expect(saved.sortOrder).toBe(7);
  });

  it('rejects a name collision with 409', async () => {
    const handler = new UpdateInvoiceReportTemplateHandler(
      makeRepo(entity(), true),
      makeRegistry(),
    );
    await expect(
      handler.execute(cmd('t1', { name: 'Taken' })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
