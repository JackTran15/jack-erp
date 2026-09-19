import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { ReportDefinition, ReportRegistry } from '../report-definition';
import { SearchCashFundReportHandler } from './search-cash-fund-report.handler';
import { SearchCashFundReportQuery } from './search-cash-fund-report.query';

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'b1',
  roles: [],
  branchIds: ['b1'],
} as unknown as ActorContext;

function dto(reportType: string): CashFundReportSearchDto {
  return {
    reportType,
    columns: ['lineLabel'],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' } },
  } as CashFundReportSearchDto;
}

describe('SearchCashFundReportHandler', () => {
  const result = { rows: [], totals: null, total: 0 };
  const definition: ReportDefinition = {
    key: 'cash-in-out-situation',
    buildColumns: jest.fn().mockResolvedValue([]),
    buildData: jest.fn().mockResolvedValue(result),
  };
  const handler = new SearchCashFundReportHandler(new ReportRegistry([definition]));

  it('dispatches to the definition registered under reportType', async () => {
    const query = new SearchCashFundReportQuery(dto('cash-in-out-situation'), actor);
    await expect(handler.execute(query)).resolves.toBe(result);
    expect(definition.buildData).toHaveBeenCalledWith(query.dto, actor);
  });

  it('refuses a reportType no definition owns', async () => {
    await expect(
      handler.execute(new SearchCashFundReportQuery(dto('shift-handover'), actor)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a real cash-fund key whose definition is not registered yet', async () => {
    // A key from CASH_FUND_REPORT_KEYS that no ticket has wired is still a 400,
    // not a 500 — the registry, not the key catalogue, decides what runs.
    await expect(
      handler.execute(new SearchCashFundReportQuery(dto('expenses-by-time'), actor)),
    ).rejects.toThrow('Unknown report type: expenses-by-time');
  });
});
