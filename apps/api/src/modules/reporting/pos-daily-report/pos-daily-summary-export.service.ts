import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { Repository } from 'typeorm';
import { PosDailySummaryResult } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { applyWorkbookFont } from '../../../common/utils/excel-workbook-font.util';
import { BranchEntity } from '../../branch/branch.entity';
import { UserEntity } from '../../auth/user.entity';
import { PosDailySummaryExportDto } from './dto/pos-daily-summary-export.dto';

const MONEY_FMT = '#,##0';
/** Points — applied uniformly to every row so the grid doesn't look uneven. */
const ROW_HEIGHT = 18;
const THIN = { style: 'thin' as const };
const BOX_BORDER: Partial<ExcelJS.Borders> = {
  top: THIN,
  bottom: THIN,
  left: THIN,
  right: THIN,
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
/** "dd/mm/yyyy - HH:mm", UTC (matches the reference template's plain-text cells). */
const formatDateTimeVi = (d: Date): string =>
  `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} - ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;

/**
 * Builds the "BÁO CÁO TỔNG HỢP" .xlsx export — a 5-column (A blank margin,
 * B/D label, C/E value) bordered grid matching the reference template
 * exactly: merges, borders, Times New Roman, `#,##0` money format. Reuses
 * the already-computed `PosDailySummaryResult` for authoritative numbers;
 * only the FE-only handover snapshot and resolved filter labels come from
 * the request (see PosDailySummaryExportDto).
 */
@Injectable()
export class PosDailySummaryExportService {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async buildWorkbookBuffer(
    summary: PosDailySummaryResult,
    dto: PosDailySummaryExportDto,
    actor: ActorContext,
  ): Promise<Buffer> {
    const [branch, user] = await Promise.all([
      this.branches.findOne({
        where: { id: dto.branchId ?? actor.branchId, organizationId: actor.organizationId },
      }),
      this.users.findOne({ where: { id: actor.userId } }),
    ]);
    const userName =
      [user?.lastName, user?.firstName].filter(Boolean).join(' ').trim() ||
      user?.email ||
      '';

    const openingAmount = dto.openingAmount ?? 0;
    const handoverAmount = dto.handoverAmount ?? 0;
    const variance =
      Math.round(
        (openingAmount + summary.revenue.cash - summary.expense.cash - handoverAmount) * 100,
      ) / 100;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo tổng hợp');
    sheet.columns = [
      { width: 3 },
      { width: 28 },
      { width: 17.85 },
      { width: 22.15 },
      { width: 17.45 },
    ];

    let row = 1;
    const header = (text: string, opts: { bold?: boolean; size?: number; center?: boolean } = {}) => {
      sheet.mergeCells(row, 2, row, 5);
      const cell = sheet.getCell(row, 2);
      cell.value = text;
      cell.font = { bold: opts.bold ?? true, size: opts.size ?? 12 };
      cell.alignment = { horizontal: opts.center ? 'center' : 'left', vertical: 'middle' };
      cell.border = BOX_BORDER;
      row += 1;
    };
    const blank = () => {
      row += 1;
    };
    const section = (label: string, opts: { center?: boolean; border?: boolean } = {}) => {
      sheet.mergeCells(row, 2, row, 5);
      const cell = sheet.getCell(row, 2);
      cell.value = label;
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: opts.center ? 'center' : 'left', vertical: 'middle' };
      if (opts.border ?? true) cell.border = BOX_BORDER;
      row += 1;
    };
    const dataRow = (
      l1: string,
      v1: number | undefined,
      l2?: string,
      v2?: number,
      opts: { indentL1?: boolean } = {},
    ) => {
      const r = sheet.getRow(row);
      r.getCell(2).value = l1;
      r.getCell(3).value = v1 ?? null;
      r.getCell(4).value = l2 ?? '';
      r.getCell(5).value = v2 ?? null;
      r.getCell(2).alignment = {
        horizontal: 'left',
        vertical: 'middle',
        indent: opts.indentL1 ? 1 : 0,
      };
      r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      r.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      if (v1 !== undefined) r.getCell(3).numFmt = MONEY_FMT;
      if (v2 !== undefined) r.getCell(5).numFmt = MONEY_FMT;
      for (const c of [2, 3, 4, 5]) r.getCell(c).border = BOX_BORDER;
      row += 1;
    };
    // Meta rows (Ngày lập / Thời gian / ...) are plain left-aligned text —
    // bold labels, regular-weight values — unlike dataRow's right-aligned
    // money columns.
    const metaRow = (l1: string, v1: string, l2 = '', v2 = '') => {
      const r = sheet.getRow(row);
      r.getCell(2).value = l1;
      r.getCell(3).value = v1;
      r.getCell(4).value = l2;
      r.getCell(5).value = v2;
      r.getCell(2).font = { bold: true, size: 12 };
      r.getCell(4).font = { bold: true, size: 12 };
      for (const c of [2, 3, 4, 5]) {
        r.getCell(c).border = BOX_BORDER;
        r.getCell(c).alignment = { horizontal: 'left', vertical: 'middle' };
      }
      row += 1;
    };

    // ── Store header ────────────────────────────────────────────────────────
    header(branch?.name ?? '', { size: 12 });
    header(branch?.address ?? '', { size: 12 });
    blank();
    header('BÁO CÁO TỔNG HỢP', { size: 12 });
    blank();
    metaRow('Ngày lập:', formatDateTimeVi(new Date()), 'Thời gian:', this.rangeText(dto));
    metaRow('Người lập:', userName, 'NVBH', dto.nvbhLabel ?? 'Tất cả');
    metaRow('Thu ngân', dto.cashierLabel ?? 'Tất cả');
    blank();

    // ── TỔNG HỢP ────────────────────────────────────────────────────────────
    // The reference template's top-level "TỔNG HỢP" title is the one section
    // header with no border (every other section header, including the
    // sibling "BÀN GIAO TIỀN" title below, has one).
    section('TỔNG HỢP', { center: true, border: false });
    blank();
    section('I. Tổng tiền');
    dataRow('Tổng thu', summary.revenue.total, 'Tổng chi', summary.expense.total);
    dataRow('Thu - chi', summary.netCashFlow);
    section('1. Thu');
    dataRow('Tiền mặt', summary.revenue.cash, 'Voucher', summary.revenue.voucher);
    dataRow('Thẻ', summary.revenue.card, 'Điểm', summary.revenue.points);
    dataRow('Chuyển khoản', summary.revenue.bankTransfer, 'Khuyến mại', summary.revenue.promotion);
    // "Điểm" and "Khuyến mại" are discounts, not money into a fund, so they are
    // reported but excluded from Tổng thu / Thu - chi — same rule as the screen.
    dataRow('(Điểm và Khuyến mại là khoản giảm giá, không tính vào tổng thu)', undefined);
    section('2. Chi');
    dataRow('Tiền mặt', summary.expense.cash, 'Chuyển khoản', summary.expense.bankTransfer);
    section('II. Công nợ');
    dataRow('Ghi nợ', summary.debt.newDebt, 'Giảm nợ', summary.debt.debtCollected);
    section('III. Hàng bán');
    dataRow('SL hàng bán', summary.goodsSold.quantity, 'Giá trị', summary.goodsSold.value);
    section('IV. Hàng trả');
    dataRow('SL hàng bán', -summary.goodsReturned.quantity, 'Giá trị', -summary.goodsReturned.value);
    section('V. Khác');
    dataRow('Tổng SL hóa đơn', summary.other.totalInvoices, 'SL Voucher', summary.other.voucherCount);
    dataRow(
      'SL hóa đơn bán hàng',
      summary.other.saleInvoices,
      'SL mã ưu đãi',
      summary.other.promoCodeCount,
      { indentL1: true },
    );
    dataRow(
      'SL hóa đơn đổi trả',
      summary.other.returnInvoices,
      'SL biên lai TT thẻ',
      summary.other.cardReceiptCount,
      { indentL1: true },
    );
    dataRow('SL hóa đơn đổi trả, mua thêm', summary.other.exchangeInvoices, undefined, undefined, {
      indentL1: true,
    });
    blank();

    // ── BÀN GIAO TIỀN ───────────────────────────────────────────────────────
    section('BÀN GIAO TIỀN', { center: true });
    section('I. Tiền nhận bàn giao');
    dataRow('Tiền mặt', openingAmount);
    section('II. Bàn giao');
    dataRow('Tiền mặt', handoverAmount);
    dataRow('Tổng SL hóa đơn', summary.other.totalInvoices, 'SL Voucher', summary.other.voucherCount);
    dataRow(
      'SL hóa đơn bán hàng',
      summary.other.saleInvoices,
      'SL mã ưu đãi',
      summary.other.promoCodeCount,
      { indentL1: true },
    );
    dataRow(
      'SL hóa đơn đổi trả',
      summary.other.returnInvoices,
      'SL biên lai TT thẻ',
      summary.other.cardReceiptCount,
      { indentL1: true },
    );
    dataRow('SL hóa đơn đổi trả, mua thêm', summary.other.exchangeInvoices, undefined, undefined, {
      indentL1: true,
    });
    section('III. Chênh lệch');
    dataRow('Tiền mặt', variance);

    // ── Ghi chú + signature ─────────────────────────────────────────────────
    sheet.mergeCells(row, 3, row, 5);
    const noteLabel = sheet.getCell(row, 2);
    noteLabel.value = 'Ghi chú';
    noteLabel.font = { bold: true, size: 12 };
    noteLabel.border = BOX_BORDER;
    const noteValue = sheet.getCell(row, 3);
    noteValue.value = dto.note ?? '';
    noteValue.border = BOX_BORDER;
    row += 1;
    blank();

    sheet.getCell(row, 2).value = 'Người lập:';
    sheet.getCell(row, 2).font = { bold: true, size: 12 };
    sheet.getCell(row, 2).border = BOX_BORDER;
    sheet.getCell(row, 5).value = 'Người nhận:';
    sheet.getCell(row, 5).font = { bold: true, size: 12 };
    sheet.getCell(row, 5).border = BOX_BORDER;
    row += 1;
    sheet.getCell(row, 2).value = userName;
    sheet.getCell(row, 2).border = BOX_BORDER;
    sheet.getCell(row, 5).value = dto.receivedByLabel ?? '';
    sheet.getCell(row, 5).border = BOX_BORDER;

    // Uniform row height — otherwise Excel auto-sizes some rows differently
    // (e.g. merged section headers) and the grid looks uneven.
    sheet.eachRow((r) => {
      r.height = ROW_HEIGHT;
    });

    applyWorkbookFont(workbook);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private rangeText(dto: PosDailySummaryExportDto): string {
    const from = dto.issuedAt?.from ? formatDateTimeVi(new Date(dto.issuedAt.from)) : '...';
    const to = dto.issuedAt?.to ? formatDateTimeVi(new Date(dto.issuedAt.to)) : '...';
    if (!dto.issuedAt?.from && !dto.issuedAt?.to) return 'Toàn bộ';
    return `Từ ${from} đến ${to}`;
  }
}
