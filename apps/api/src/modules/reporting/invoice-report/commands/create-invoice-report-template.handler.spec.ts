import { BadRequestException, ConflictException } from '@nestjs/common';
import { CreateInvoiceReportTemplateHandler } from './create-invoice-report-template.handler';
import { CreateInvoiceReportTemplateCommand } from './create-invoice-report-template.command';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const actor = { userId: 'u1', organizationId: 'org-1', branchId: 'b1', roles: [] } as any;

function makeHandler(dup: boolean) {
  const repo: any = {
    findOne: jest.fn(async () => (dup ? { id: 'existing' } : null)),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({
      ...x,
      id: 't1',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    })),
  };
  return { handler: new CreateInvoiceReportTemplateHandler(repo), repo };
}

describe('CreateInvoiceReportTemplateHandler', () => {
  it('rejects unknown columns (fixed or dynamic) with 400', async () => {
    const { handler } = makeHandler(false);
    await expect(
      handler.execute(
        new CreateInvoiceReportTemplateCommand(
          { reportType: 'daily-sales-summary', name: 'T', columns: ['date', 'nope'] } as any,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate name with 409', async () => {
    const { handler } = makeHandler(true);
    await expect(
      handler.execute(
        new CreateInvoiceReportTemplateCommand(
          { reportType: 'daily-sales-summary', name: 'T', columns: ['date'] } as any,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists reportType + columns + columnFilters and returns the view', async () => {
    const { handler, repo } = makeHandler(false);
    const view = await handler.execute(
      new CreateInvoiceReportTemplateCommand(
        {
          reportType: 'daily-sales-summary',
          name: 'Doanh thu ngày',
          columns: ['date', 'revenue.total', `payment.method.${ACC}`],
          filters: { issuedAt: { from: '2026-06-01' } },
          columnFilters: [{ col: 'revenue.total', gte: 1000 }],
        } as any,
        actor,
      ),
    );
    expect(view).toMatchObject({
      id: 't1',
      reportType: 'daily-sales-summary',
      name: 'Doanh thu ngày',
      columns: ['date', 'revenue.total', `payment.method.${ACC}`],
      columnFilters: [{ col: 'revenue.total', gte: 1000 }],
    });
    // persisted filters blob folds columnFilters in
    const saved = repo.save.mock.calls[0][0];
    expect(saved.organizationId).toBe('org-1');
    expect(saved.createdBy).toBe('u1');
    expect(saved.filters.columnFilters).toEqual([{ col: 'revenue.total', gte: 1000 }]);
  });
});
