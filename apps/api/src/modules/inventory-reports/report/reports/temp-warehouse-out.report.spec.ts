import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { TempWarehouseIssueRow } from '../../services/temp-warehouse-report.service';
import { TempWarehouseOutReport } from './temp-warehouse-out.report';

const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

const engineRow: TempWarehouseIssueRow = {
  sku: 'SKU-1',
  name: 'Item 1',
  unit: 'Đôi',
  location: 'SR-01',
  date: '03/07/2026',
  time: '09:15:00',
  staff: 'Nguyễn Văn A',
  outQty: 1,
  returnQty: 0,
  saleQty: 0,
  remainingQty: 4,
  status: 'Xuất không bán',
  invoice: '',
};

function build(rows: TempWarehouseIssueRow[]) {
  const engine = {
    list: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return new TempWarehouseOutReport(engine as never, branches as never);
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-temp-warehouse-out',
  columns: ['sku', 'date', 'time', 'staff', 'outQty', 'returnQty', 'status', 'invoice'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('TempWarehouseOutReport', () => {
  it('exposes status as a select column with the engine status values', async () => {
    const cols = await build([]).buildColumns();
    const status = cols.find((c) => c.col === 'status')!;
    expect(status.filterKind).toBe('select');
    expect(status.filterOptions!.map((o) => o.value)).toEqual([
      'Xuất không bán',
      'Trả hàng trưng bày',
    ]);
    expect(cols.find((c) => c.col === 'time')!.filterKind).toBe('time');
    expect(cols.find((c) => c.col === 'date')!.filterKind).toBe('date');
  });

  it('passes engine rows through and filters by status column', async () => {
    const rows = [
      engineRow,
      { ...engineRow, sku: 'SKU-2', returnQty: 1, status: '' },
    ];
    const report = build(rows);
    const all = await report.buildData(dto, actor);
    expect(all.total).toBe(2);
    expect(all.totals!.outQty).toBe(2);
    expect(all.totals!.returnQty).toBe(1);

    const filtered = await report.buildData(
      { ...dto, columnFilters: [{ col: 'status', equals: 'Xuất không bán' }] },
      actor,
    );
    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].sku).toBe('SKU-1');
  });
});
