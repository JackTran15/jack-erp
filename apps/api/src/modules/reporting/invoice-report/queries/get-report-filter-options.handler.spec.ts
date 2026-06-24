import { BadRequestException } from '@nestjs/common';
import { ReportFilterOptionType } from '@erp/shared-interfaces';
import { GetReportFilterOptionsHandler } from './get-report-filter-options.handler';

const actor = { userId: 'u1', organizationId: 'org-1', branchId: 'b1', roles: [] } as any;

function makeHandler(overrides: Record<string, any> = {}) {
  const branches = {
    find: jest.fn(async () => [{ id: 'b1', name: 'Cần Thơ' }]),
  };
  const users = {
    find: jest.fn(async () => [
      { id: 'usr-1', firstName: 'Thu', lastName: 'Nguyễn', email: 'thu@x.vn' },
    ]),
  };
  const employees = { createQueryBuilder: jest.fn() };
  const customers = {
    find: jest.fn(async () => [{ id: 'cus-1', name: 'Khách lẻ', phone: '0900' }]),
  };
  const categories = {
    find: jest.fn(async () => [{ id: 'cat-1', name: 'Đồ uống' }]),
  };
  const items = { createQueryBuilder: jest.fn() };
  const repos = { branches, users, employees, customers, categories, items, ...overrides };
  const handler = new GetReportFilterOptionsHandler(
    repos.branches as any,
    repos.users as any,
    repos.employees as any,
    repos.customers as any,
    repos.categories as any,
    repos.items as any,
  );
  return { handler, repos };
}

const run = (handler: GetReportFilterOptionsHandler, dto: any) =>
  handler.execute({ dto, actor } as any);

describe('GetReportFilterOptionsHandler', () => {
  it('store: maps branches to options with metadata.branchId, org-scoped', async () => {
    const { handler, repos } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.STORE });
    expect(out).toEqual([
      { value: 'b1', label: 'Cần Thơ', metadata: { branchId: 'b1' } },
    ]);
    expect((repos.branches.find as jest.Mock).mock.calls[0][0].where.organizationId).toBe('org-1');
  });

  it('cashier: label is "Last First", filtered by org + active', async () => {
    const { handler, repos } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.CASHIER });
    expect(out).toEqual([{ value: 'usr-1', label: 'Nguyễn Thu' }]);
    const where = (repos.users.find as jest.Mock).mock.calls[0][0].where;
    expect(where.organizationId).toBe('org-1');
    expect(where.isActive).toBe(true);
  });

  it('cashier: search builds an OR over first/last name', async () => {
    const { handler, repos } = makeHandler();
    await run(handler, { type: ReportFilterOptionType.CASHIER, search: 'thu' });
    const where = (repos.users.find as jest.Mock).mock.calls[0][0].where;
    expect(Array.isArray(where)).toBe(true);
    expect(where).toHaveLength(2);
    expect(where[0].organizationId).toBe('org-1');
  });

  it('customer: search matches name or phone', async () => {
    const { handler, repos } = makeHandler();
    const out = await run(handler, {
      type: ReportFilterOptionType.CUSTOMER,
      search: 'le',
    });
    expect(out[0]).toEqual({
      value: 'cus-1',
      label: 'Khách lẻ',
      metadata: { phone: '0900' },
    });
    expect((repos.customers.find as jest.Mock).mock.calls[0][0].where).toHaveLength(2);
  });

  it('invoiceStatus: returns the static enum table (real backend statuses)', async () => {
    const { handler } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.INVOICE_STATUS });
    expect(out).toEqual([
      { value: 'draft', label: 'Lưu tạm' },
      { value: 'pending', label: 'Chờ xử lý' },
      { value: 'paid', label: 'Hoàn thành' },
      { value: 'debt', label: 'Công nợ' },
      { value: 'partial_debt', label: 'Nợ một phần' },
      { value: 'cancelled', label: 'Đã hủy' },
    ]);
  });

  it('statBy: returns item | parent | group (reconciled grain)', async () => {
    const { handler } = makeHandler();
    const out = await run(handler, { type: ReportFilterOptionType.STAT_BY });
    expect(out.map((o) => o.value)).toEqual(['item', 'parent', 'group']);
  });

  it('unknown type throws 400', async () => {
    const { handler } = makeHandler();
    await expect(run(handler, { type: 'bogus' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
