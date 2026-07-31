import * as ExcelJS from 'exceljs';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PosDailySummaryExportService } from './pos-daily-summary-export.service';
import { PosDailySummaryExportDto } from './dto/pos-daily-summary-export.dto';
import { PosDailySummaryResult } from '@erp/shared-interfaces';

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'b1',
  roles: [],
  permissions: [],
} as unknown as ActorContext;

const summary: PosDailySummaryResult = {
  revenue: { cash: 1887118000, card: 585000, bankTransfer: 12400000, voucher: 0, points: 50835000, total: 1950938000 },
  expense: { cash: 805636500, bankTransfer: 672222, total: 806308722 },
  netCashFlow: 1144629278,
  debt: { newDebt: 16175000, debtCollected: 0 },
  goodsSold: { quantity: 3221, value: 1956420500 },
  goodsReturned: { quantity: 92, value: 71002500 },
  other: {
    totalInvoices: 2481,
    saleInvoices: 2392,
    returnInvoices: 5,
    exchangeInvoices: 84,
    voucherCount: 0,
    promoCodeCount: 0,
    cardReceiptCount: 1,
  },
};

function repoStub(row: unknown) {
  return { findOne: () => Promise.resolve(row) } as any;
}

async function loadSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

/** Row number (1-indexed) of the first row whose col-B (or col-D) cell matches `label`. */
function findRow(sheet: ExcelJS.Worksheet, label: string): number {
  for (let r = 1; r <= sheet.rowCount; r++) {
    if (sheet.getCell(r, 2).value === label || sheet.getCell(r, 4).value === label) {
      return r;
    }
  }
  throw new Error(`Row not found for label: ${label}`);
}

describe('PosDailySummaryExportService', () => {
  it('matches the reference "Báo cáo tổng hợp (3).xls" template structure and values', async () => {
    const service = new PosDailySummaryExportService(
      repoStub({ name: 'Chi nhánh 211 TP. Đà Nẵng', address: '211 Lê Duẩn, Thanh Khê - Đà Nẵng' }),
      repoStub({ firstName: 'Hà', lastName: 'Phan Thanh' }),
    );

    const dto: PosDailySummaryExportDto = {
      issuedAt: { from: '2026-01-01T00:00:00.000Z', to: '2026-07-27T23:59:59.999Z' },
      cashierLabel: 'Tất cả',
      nvbhLabel: 'Tất cả',
      openingAmount: 0,
      handoverAmount: 1081481500,
      receivedByLabel: '',
      note: '',
    };

    const buffer = await service.buildWorkbookBuffer(summary, dto, actor);
    const sheet = await loadSheet(buffer);

    // Header
    expect(sheet.getCell('B1').value).toBe('Chi nhánh 211 TP. Đà Nẵng');
    expect(sheet.getCell('B2').value).toBe('211 Lê Duẩn, Thanh Khê - Đà Nẵng');
    expect(sheet.getCell('B4').value).toBe('BÁO CÁO TỔNG HỢP');

    const ngayLap = findRow(sheet, 'Ngày lập:');
    expect(sheet.getCell(ngayLap, 5).value).toBe(
      'Từ 01/01/2026 - 00:00 đến 27/07/2026 - 23:59',
    );
    const nguoiLap = findRow(sheet, 'Người lập:');
    expect(sheet.getCell(nguoiLap, 3).value).toBe('Phan Thanh Hà');
    expect(sheet.getCell(nguoiLap, 5).value).toBe('Tất cả'); // NVBH
    const thuNgan = findRow(sheet, 'Thu ngân');
    expect(sheet.getCell(thuNgan, 3).value).toBe('Tất cả');

    // TỔNG HỢP section
    expect(sheet.getCell('B10').value).toBe('TỔNG HỢP');
    const tongThu = findRow(sheet, 'Tổng thu');
    expect(sheet.getCell(tongThu, 3).value).toBe(1950938000);
    expect(sheet.getCell(tongThu, 5).value).toBe(806308722); // Tổng chi
    const thuChi = findRow(sheet, 'Thu - chi');
    expect(sheet.getCell(thuChi, 3).value).toBe(1144629278);

    const congNo = findRow(sheet, 'II. Công nợ');
    expect(sheet.getCell(congNo + 1, 2).value).toBe('Ghi nợ');
    expect(sheet.getCell(congNo + 1, 3).value).toBe(16175000);
    expect(sheet.getCell(congNo + 1, 4).value).toBe('Giảm nợ');
    expect(sheet.getCell(congNo + 1, 5).value).toBe(0);

    const hangBan = findRow(sheet, 'III. Hàng bán');
    expect(sheet.getCell(hangBan + 1, 3).value).toBe(3221);
    expect(sheet.getCell(hangBan + 1, 5).value).toBe(1956420500);

    // Hàng trả prints negative (goods leaving the sold total).
    const hangTra = findRow(sheet, 'IV. Hàng trả');
    expect(sheet.getCell(hangTra + 1, 3).value).toBe(-92);
    expect(sheet.getCell(hangTra + 1, 5).value).toBe(-71002500);

    // BÀN GIAO TIỀN section
    const banGiaoTien = findRow(sheet, 'BÀN GIAO TIỀN');
    const tienNhanBanGiao = findRow(sheet, 'I. Tiền nhận bàn giao');
    expect(tienNhanBanGiao).toBeGreaterThan(banGiaoTien);
    expect(sheet.getCell(tienNhanBanGiao + 1, 2).value).toBe('Tiền mặt');
    expect(sheet.getCell(tienNhanBanGiao + 1, 3).value).toBe(0);

    const banGiao = findRow(sheet, 'II. Bàn giao');
    expect(sheet.getCell(banGiao + 1, 2).value).toBe('Tiền mặt');
    expect(sheet.getCell(banGiao + 1, 3).value).toBe(1081481500);

    // Merges + borders + number format sanity checks.
    expect(sheet.getCell('B1').isMerged).toBe(true);
    expect(sheet.getCell(tongThu, 3).numFmt).toBe('#,##0');
    expect(sheet.getCell('B12').border?.top?.style).toBe('thin');
    // TỔNG HỢP is the one section header with no border, per the reference.
    expect(sheet.getCell('B10').border?.top).toBeUndefined();
    // Every cell carries the workbook-wide Times New Roman font.
    expect(sheet.getCell(tongThu, 2).font?.name).toBe('Times New Roman');
  });

  it('nets Tiền bàn giao and revenue/expense cash into "III. Chênh lệch"', async () => {
    const service = new PosDailySummaryExportService(repoStub(null), repoStub(null));
    const dto: PosDailySummaryExportDto = {
      issuedAt: {},
      openingAmount: 1000000,
      handoverAmount: 5300000,
    };
    const buffer = await service.buildWorkbookBuffer(summary, dto, actor);
    const sheet = await loadSheet(buffer);
    const chenhLech = findRow(sheet, 'III. Chênh lệch');
    const expected = 1000000 + summary.revenue.cash - summary.expense.cash - 5300000;
    expect(sheet.getCell(chenhLech + 1, 3).value).toBe(expected);
  });

  it('accepts a negative handoverAmount (chênh lệch âm khi chi vượt thu tiền mặt) — no floor at 0, matching the print flow', async () => {
    const service = new PosDailySummaryExportService(repoStub(null), repoStub(null));
    const dto: PosDailySummaryExportDto = {
      issuedAt: {},
      openingAmount: 0,
      handoverAmount: -58836000,
    };
    const buffer = await service.buildWorkbookBuffer(summary, dto, actor);
    const sheet = await loadSheet(buffer);

    const banGiao = findRow(sheet, 'II. Bàn giao');
    expect(sheet.getCell(banGiao + 1, 3).value).toBe(-58836000);

    const chenhLech = findRow(sheet, 'III. Chênh lệch');
    const expected = 0 + summary.revenue.cash - summary.expense.cash - -58836000;
    expect(sheet.getCell(chenhLech + 1, 3).value).toBe(expected);
  });

  it('indents the SL hóa đơn breakdown rows under both V. Khác and II. Bàn giao, and gives every row equal height', async () => {
    const service = new PosDailySummaryExportService(repoStub(null), repoStub(null));
    const dto: PosDailySummaryExportDto = { issuedAt: {} };
    const buffer = await service.buildWorkbookBuffer(summary, dto, actor);
    const sheet = await loadSheet(buffer);

    const breakdownLabels = [
      'SL hóa đơn bán hàng',
      'SL hóa đơn đổi trả',
      'SL hóa đơn đổi trả, mua thêm',
    ];
    let occurrences = 0;
    let uniformHeight: number | undefined;
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      if (row.getCell(2).value === 'Tổng SL hóa đơn') {
        // Not indented — only the nested breakdown rows are.
        expect(row.getCell(2).alignment?.indent ?? 0).toBe(0);
      }
      if (breakdownLabels.includes(row.getCell(2).value as string)) {
        occurrences += 1;
        expect(row.getCell(2).alignment?.indent).toBe(1);
      }
      if (row.getCell(2).value) {
        if (uniformHeight === undefined) uniformHeight = row.height;
        else expect(row.height).toBe(uniformHeight);
      }
    }
    // 3 labels × 2 sections (V. Khác + II. Bàn giao).
    expect(occurrences).toBe(6);
    expect(uniformHeight).toBeGreaterThan(0);
  });
});
