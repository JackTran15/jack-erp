import { DepositBalanceService } from './deposit-balance.service';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'br1',
  roles: [],
} as ActorContext;

function buildService(bookSum: number, availableSum: number) {
  const query = jest
    .fn()
    // sumSigned is called twice per getBalances: book (clearedOnly=false) then available (clearedOnly=true).
    .mockImplementationOnce(() => Promise.resolve([{ sum: bookSum }]))
    .mockImplementationOnce(() => Promise.resolve([{ sum: availableSum }]));
  const repo = { query };
  const service = new DepositBalanceService(repo as any);
  return { service, query };
}

describe('DepositBalanceService.getBalances', () => {
  it('bookBalance/availableBalance come from two separate scalar SUM queries', async () => {
    const { service, query } = buildService(1_000_000, 700_000);

    const result = await service.getBalances('acc1', actor);

    expect(result).toEqual({
      bookBalance: 1_000_000,
      availableBalance: 700_000,
      pendingClearingAmount: 300_000,
    });
    expect(query).toHaveBeenCalledTimes(2);
    const availableSql = query.mock.calls[1][0] as string;
    expect(availableSql).toContain('value_date IS NULL OR m.value_date <= CURRENT_DATE');
  });

  it('pendingClearingAmount is 0 when nothing is pending (book == available)', async () => {
    const { service } = buildService(500_000, 500_000);
    const result = await service.getBalances('acc1', actor);
    expect(result.pendingClearingAmount).toBe(0);
  });

  it('scopes by organizationId and branchId', async () => {
    const { service, query } = buildService(0, 0);
    await service.getBalances('acc1', actor);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('m.organization_id = $2');
    expect(sql).toContain('m.branch_id = $3');
    expect(params).toEqual(['acc1', 'org1', 'br1']);
  });

  it('asOfDate restricts to doc_date <= asOfDate (period-close snapshot use)', async () => {
    const { service, query } = buildService(0, 0);
    await service.getBalances('acc1', actor, '2026-06-30');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('m.doc_date <=');
    expect(params).toContain('2026-06-30');
  });
});
