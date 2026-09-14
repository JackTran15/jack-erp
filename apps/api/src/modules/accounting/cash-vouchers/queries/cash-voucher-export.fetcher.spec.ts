import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { StringOperator } from '../../../../common/filters/filter.dto';
import {
  CashVoucherRowDto,
  CashVoucherSearchV2Dto,
} from '../dto/cash-voucher-search-v2.dto';
import {
  CashVoucherDocumentKind,
  CashVoucherKind,
  CashVoucherStatus,
} from '../enums';
import { CashVoucherExportFetcher } from './cash-voucher-export.fetcher';
import { SearchCashVouchersV2Query } from './search-cash-vouchers-v2.query';

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const row = (overrides: Partial<CashVoucherRowDto> = {}): CashVoucherRowDto => ({
  documentKind: CashVoucherDocumentKind.CASH_RECEIPT,
  kind: CashVoucherKind.RECEIPT,
  id: 'v-1',
  createdAt: '2026-07-15T20:00:00.000Z',
  voucherDate: '2026-07-15',
  documentNumber: 'PT0001',
  status: CashVoucherStatus.POSTED,
  totalAmount: 137248600,
  cashAccountId: 'acc-1',
  referenceType: null,
  revision: 1,
  counterparty: 'A Chinh',
  personName: 'Nguyễn Văn B',
  reason: 'Thu tiền hàng',
  ...overrides,
});

// The query construction, not the SQL, is what this fetcher owns — the SQL
// itself belongs to SearchCashVouchersV2Handler and is exercised by its own
// spec. This one proves the fetcher reuses that exact query object with the
// export's row cap instead of the grid's page size (AC-17).
describe('CashVoucherExportFetcher', () => {
  const build = (dto: CashVoucherSearchV2Dto, limit = 50_000) => {
    const execute = jest.fn();
    const queryBus = { execute } as unknown as { execute: jest.Mock };
    const fetcher = new CashVoucherExportFetcher(
      queryBus as any,
      dto,
      actor,
      limit,
    );
    return { fetcher, execute };
  };

  it('queries once with page 1 and the export cap, discarding whatever page/limit the grid sent', async () => {
    const dto: CashVoucherSearchV2Dto = { page: 3, limit: 20 };
    const { fetcher, execute } = build(dto, 50_000);
    execute.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50_000, totalAmount: 0 });

    await fetcher.drain(jest.fn());

    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0][0] as SearchCashVouchersV2Query;
    expect(query).toBeInstanceOf(SearchCashVouchersV2Query);
    expect(query.dto).toEqual({ page: 1, limit: 50_000 });
  });

  it('preserves every filter on the dto untouched, only overriding page and limit', async () => {
    const dto: CashVoucherSearchV2Dto = {
      page: 3,
      limit: 20,
      cashAccountId: 'acc-1',
      documentNumber: { operator: StringOperator.CONTAINS, value: 'PT' },
    };
    const { fetcher, execute } = build(dto, 50_000);
    execute.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50_000, totalAmount: 0 });

    await fetcher.drain(jest.fn());

    const query = execute.mock.calls[0][0] as SearchCashVouchersV2Query;
    expect(query.dto).toEqual({
      cashAccountId: 'acc-1',
      documentNumber: { operator: StringOperator.CONTAINS, value: 'PT' },
      page: 1,
      limit: 50_000,
    });
    expect(query.actor).toBe(actor);
  });

  it('pushes every row from a single call, projected onto the export columns', async () => {
    const rows = [row({ id: 'v-1' }), row({ id: 'v-2', documentNumber: 'PT0002' })];
    const { fetcher, execute } = build({});
    execute.mockResolvedValue({ data: rows, total: 2, page: 1, limit: 50_000, totalAmount: 0 });

    const pushed: unknown[][] = [];
    const totals = await fetcher.drain(async (batch) => {
      pushed.push(batch);
    });

    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toEqual([
      {
        // Passed through as-is from the CTE's bare 'YYYY-MM-DD' string — not
        // routed through `new Date()` / business-timezone conversion, which
        // would risk shifting the calendar day (AC-14).
        voucherDate: '2026-07-15',
        documentNumber: 'PT0001',
        documentKind: 'CASH_RECEIPT',
        status: 'POSTED',
        totalAmount: 137248600,
        counterparty: 'A Chinh',
        personName: 'Nguyễn Văn B',
        reason: 'Thu tiền hàng',
      },
      {
        voucherDate: '2026-07-15',
        documentNumber: 'PT0002',
        documentKind: 'CASH_RECEIPT',
        status: 'POSTED',
        totalAmount: 137248600,
        counterparty: 'A Chinh',
        personName: 'Nguyễn Văn B',
        reason: 'Thu tiền hàng',
      },
    ]);
    expect(totals).toBeNull();
  });

  it('passes voucherDate through untouched even when it differs from createdAt (AC-14)', async () => {
    // Guards the exact scenario the ADR calls out: a voucher dated one day and
    // recorded another, e.g. a late entry. If this ever regressed to deriving
    // the export cell from createdAt, this is the row that would catch it.
    const rows = [row({ createdAt: '2026-09-13T20:00:00.000Z', voucherDate: '2026-09-06' })];
    const { fetcher, execute } = build({});
    execute.mockResolvedValue({ data: rows, total: 1, page: 1, limit: 50_000, totalAmount: 0 });

    const pushed: Record<string, unknown>[][] = [];
    await fetcher.drain(async (batch) => {
      pushed.push(batch as Record<string, unknown>[]);
    });

    expect(pushed[0][0].voucherDate).toBe('2026-09-06');
  });

  it('keeps party and person as two separate export cells (AC-14)', async () => {
    // The whole point of the feature: a projection that dropped one of them, or
    // wrote the same source into both, would still produce a valid file.
    const { fetcher, execute } = build({});
    execute.mockResolvedValue({
      data: [row({ counterparty: 'kkkk', personName: '123123' })],
      total: 1,
      page: 1,
      limit: 50_000,
      totalAmount: 0,
    });

    const pushed: Record<string, unknown>[][] = [];
    await fetcher.drain(async (batch) => {
      pushed.push(batch as Record<string, unknown>[]);
    });

    expect(pushed[0][0].counterparty).toBe('kkkk');
    expect(pushed[0][0].personName).toBe('123123');
  });

  it('does not push when the filter matches no vouchers, and still returns null totals (AC-18)', async () => {
    const { fetcher, execute } = build({});
    execute.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50_000, totalAmount: 0 });

    const push = jest.fn();
    const totals = await fetcher.drain(push);

    expect(push).not.toHaveBeenCalled();
    expect(totals).toBeNull();
  });
});
