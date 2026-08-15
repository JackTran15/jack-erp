import { EXPORT_ROW_LIMIT } from '../../../reporting/report-core/report-export.service';
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
      'Bán hàng kho tạm',
      'Chuyển kho xuất đi',
      'Chuyển kho trả lại',
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

  // AC-08 — lọc theo trạng thái mới, và `totals` chỉ cộng những dòng đã lọc.
  // Đây là con số đi thẳng vào dòng tổng của file Excel.
  it('filters by the new "Bán hàng kho tạm" status and totals only those rows', async () => {
    const sold: TempWarehouseIssueRow = {
      ...engineRow,
      sku: 'SKU-SOLD',
      saleQty: 1,
      remainingQty: 0,
      status: 'Bán hàng kho tạm',
      invoice: 'INV-1',
    };
    const report = build([engineRow, sold]);

    const filtered = await report.buildData(
      {
        ...dto,
        // `totals` chỉ dựng cho những cột được yêu cầu, nên phải xin saleQty
        // mới kiểm được nó — đúng hành vi của `buildTotalsRow`.
        columns: [...dto.columns!, 'saleQty'],
        columnFilters: [{ col: 'status', equals: 'Bán hàng kho tạm' }],
      },
      actor,
    );

    expect(filtered.total).toBe(1);
    expect(filtered.rows[0].sku).toBe('SKU-SOLD');
    expect(filtered.totals!.outQty).toBe(1);
    expect(filtered.totals!.saleQty).toBe(1);
  });

  // AC-08 — Xuất khẩu gọi buildData với limit = EXPORT_ROW_LIMIT (lấy trọn),
  // lưới gọi với limit nhỏ (một trang). Cả hai phải cho cùng `totals` và cùng
  // `total`; đó là thứ khiến dòng tổng trong Excel không thể lệch footer lưới.
  //
  // Con số trong file Excel ĐÚNG LÀ `buildData(...).totals`: report này không
  // khai `exportSource` nên `buildFetcher` chọn nhánh single-shot, và
  // `SingleShotFetcher.drain` trả thẳng `data.totals` cho `writer.end(totals)`.
  // Việc đường export truyền đúng dto mà lưới dùng thì spec này không thấy được
  // — nó tự dựng cả hai dto; phần đó đã có ở `report-export.service.spec.ts:131`
  // (assert `buildData` được gọi với `{ page: 1, limit: EXPORT_ROW_LIMIT }`).
  it('gives export and grid the same totals for the same filter', async () => {
    const rows = [
      engineRow,
      { ...engineRow, sku: 'SKU-2' },
      { ...engineRow, sku: 'SKU-3', status: 'Bán hàng kho tạm', invoice: 'INV-9' },
    ];
    const report = build(rows);
    // Cùng MỘT bộ lọc ở cả hai đường — nếu không truyền filter thì test chỉ
    // chứng minh "totals độc lập với trang", không phải "export áp cùng filter".
    const filtered = {
      ...dto,
      columnFilters: [{ col: 'status', equals: 'Xuất không bán' }],
    };

    const grid = await report.buildData({ ...filtered, page: 1, limit: 1 }, actor);
    const exported = await report.buildData(
      { ...filtered, page: 1, limit: EXPORT_ROW_LIMIT },
      actor,
    );

    expect(grid.rows).toHaveLength(1);
    expect(exported.rows).toHaveLength(2);
    expect(grid.total).toBe(exported.total);
    expect(grid.totals).toEqual(exported.totals);
    // Dòng thứ ba bị filter loại, nên tổng là 2 chứ không phải 3.
    expect(exported.totals!.outQty).toBe(2);
  });
});
