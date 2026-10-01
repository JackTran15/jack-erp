import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CASH_FUND_ROW_KEYS,
  CashFundDocumentKind,
  InvoiceReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from '../../../accounting/deposit/deposit-account.entity';
import { UserEntity } from '../../../auth/user.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { PROFIT_CONSOLIDATED, resolveReportBranchIds } from '../../report-core/report-query.util';
import {
  applyCategoryFilter,
  BusinessResultsSource,
  dateColumn,
  OtherLineDirection,
  VOUCHER_KINDS_BY_DIRECTION,
} from '../business-results.source';
import { ProfitReportFilterDto } from '../dto/profit-report-filter.dto';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';
import { enrichHeader } from '../report-column.util';
import { ReportDefinition } from '../report-definition';

const COLUMNS: { key: string; type: ReportColumnDataType; width: number }[] = [
  { key: 'ngayChungTu', type: ReportColumnDataType.DATE, width: 110 },
  { key: 'soChungTu', type: ReportColumnDataType.STRING, width: 110 },
  { key: 'taiKhoanNganHang', type: ReportColumnDataType.STRING, width: 140 },
  { key: 'dienGiai', type: ReportColumnDataType.STRING, width: 270 },
  { key: 'giaTri', type: ReportColumnDataType.CURRENCY, width: 120 },
  { key: 'doiTuong', type: ReportColumnDataType.STRING, width: 150 },
  { key: 'nguoiNopNhan', type: ReportColumnDataType.STRING, width: 140 },
  { key: 'nhanVien', type: ReportColumnDataType.STRING, width: 140 },
];
const KNOWN = new Set(COLUMNS.map((c) => c.key));

const LABELS: Record<OtherLineDirection, Record<string, string>> = {
  out: {
    ngayChungTu: 'Ngày chứng từ',
    soChungTu: 'Số chứng từ',
    taiKhoanNganHang: 'Tài khoản ngân hàng',
    dienGiai: 'Diễn giải',
    giaTri: 'Giá trị',
    doiTuong: 'Đối tượng',
    nguoiNopNhan: 'Người nhận',
    nhanVien: 'Nhân viên chi',
  },
  in: {
    ngayChungTu: 'Ngày chứng từ',
    soChungTu: 'Số chứng từ',
    taiKhoanNganHang: 'Tài khoản ngân hàng',
    dienGiai: 'Diễn giải',
    giaTri: 'Giá trị',
    doiTuong: 'Đối tượng',
    nguoiNopNhan: 'Người nộp',
    nhanVien: 'Nhân viên thu',
  },
};

/** The user id column holding "Nhân viên thu/chi" on each voucher header. */
const STAFF_COLUMN: Record<CashFundDocumentKind, string> = {
  CASH_RECEIPT: 'staffId',
  CASH_PAYMENT: 'staffId',
  BANK_RECEIPT: 'collectedBy',
  BANK_PAYMENT: 'paidBy',
};

interface VoucherLineRow {
  voucherId: string;
  lineId: string;
  docDate: string;
  documentNumber: string | null;
  depositAccount: string | null;
  description: string | null;
  reason: string | null;
  amount: string;
  partnerName: string | null;
  partyName: string | null;
  staffName: string | null;
}

/**
 * "Chi tiết thu/chi tiền theo mục" — the voucher lines behind one 2.2.x / 3.2.x
 * cell of "Kết quả kinh doanh" (or behind 2.2 / 3.2 as a whole when no category
 * is given). Reads the statement's own row set, so the footer total equals the
 * clicked cell.
 */
@Injectable()
export class BusinessResultsVouchersReport implements ReportDefinition {
  readonly key = 'business-results-vouchers';

  constructor(
    private readonly source: BusinessResultsSource,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(
    _actor: ActorContext,
    filters?: ProfitReportFilterDto,
  ): Promise<ReportColumnHeader[]> {
    const labels = LABELS[filters?.otherLineDirection ?? 'out'];
    return COLUMNS.map((c) => ({
      ...enrichHeader({ col: c.key, name: labels[c.key], desc: null, type: c.type, group: null }),
      width: c.width,
    }));
  }

  async buildData(
    dto: ProfitReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const period = dto.filters?.issuedAt;
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.issuedAt is required');
    }
    const direction = dto.filters.otherLineDirection;
    if (!direction) {
      throw new BadRequestException('filters.otherLineDirection is required');
    }
    const referenced = [...dto.columns, ...(dto.columnFilters ?? []).map((f) => f.col)];
    const unknown = referenced.filter((k) => !KNOWN.has(k));
    if (unknown.length) {
      throw new BadRequestException(`Unknown report columns: ${[...new Set(unknown)].join(', ')}`);
    }

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      PROFIT_CONSOLIDATED,
    );
    const scope = {
      organizationId: actor.organizationId,
      branchIds: resolveReportBranchIds(hasConsolidated, dto.filters.store, dto.filters.branchId, actor),
      from: period.from,
      to: period.to,
    };

    const perKind = await Promise.all(
      VOUCHER_KINDS_BY_DIRECTION[direction].map(async (kind) => {
        const qb = this.source.voucherLineQuery(kind, scope);
        applyCategoryFilter(qb, dto.filters.voucherCategoryId);
        const isDeposit = kind === 'BANK_RECEIPT' || kind === 'BANK_PAYMENT';
        if (isDeposit) {
          qb.leftJoin(DepositAccountEntity, 'da', 'da.id = voucher.depositAccountId');
        }
        qb.leftJoin(
          UserEntity,
          'su',
          `CAST(su.id AS text) = CAST(voucher.${STAFF_COLUMN[kind]} AS text)`,
        );
        const raw = await qb
          .select('voucher.id', 'voucherId')
          .addSelect('line.id', 'lineId')
          .addSelect(`TO_CHAR(voucher.${dateColumn(kind)}, 'YYYY-MM-DD')`, 'docDate')
          .addSelect('voucher.documentNumber', 'documentNumber')
          .addSelect(
            isDeposit ? `CASE WHEN da.id IS NULL THEN NULL ELSE da.name || ' · ' || da.accountNo END` : 'NULL',
            'depositAccount',
          )
          .addSelect('line.description', 'description')
          .addSelect('voucher.reason', 'reason')
          .addSelect('line.amount', 'amount')
          .addSelect('voucher.partnerNameSnapshot', 'partnerName')
          .addSelect(kind.endsWith('RECEIPT') ? 'voucher.payerName' : 'voucher.payeeName', 'partyName')
          .addSelect(
            `NULLIF(btrim(COALESCE(su.firstName, '') || ' ' || COALESCE(su.lastName, '')), '')`,
            'staffName',
          )
          .getRawMany<VoucherLineRow>();
        return raw.map((r) => ({ kind, r }));
      }),
    );

    let rows: ReportRow[] = perKind
      .flat()
      .sort(
        (a, b) =>
          String(a.r.docDate).localeCompare(String(b.r.docDate)) ||
          String(a.r.documentNumber ?? '').localeCompare(String(b.r.documentNumber ?? '')),
      )
      .map(({ kind, r }) => ({
        ngayChungTu: r.docDate,
        soChungTu: r.documentNumber,
        taiKhoanNganHang: r.depositAccount,
        dienGiai: r.description || r.reason,
        giaTri: Number(r.amount ?? 0),
        doiTuong: r.partnerName,
        nguoiNopNhan: r.partyName,
        nhanVien: r.staffName,
        [CASH_FUND_ROW_KEYS.VOUCHER_ID]: r.voucherId,
        [CASH_FUND_ROW_KEYS.VOUCHER_KIND]: kind,
      }));

    if (dto.columnFilters?.length) {
      rows = rows.filter((row) => dto.columnFilters!.every((f) => matchColumnFilter(row[f.col] ?? null, f)));
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const total = rows.length;
    const totalAmount = rows.reduce((sum, r) => sum + Number(r.giaTri ?? 0), 0);
    const pageRows = rows.slice((page - 1) * limit, page * limit).map((row) => pick(row, dto.columns));

    return {
      rows: pageRows,
      totals: total ? { giaTri: Math.round(totalAmount * 100) / 100 } : null,
      total,
    };
  }
}

const HIDDEN_KEYS = [CASH_FUND_ROW_KEYS.VOUCHER_ID, CASH_FUND_ROW_KEYS.VOUCHER_KIND];

function pick(row: ReportRow, columns: string[]): ReportRow {
  const out: ReportRow = {};
  for (const c of [...columns, ...HIDDEN_KEYS]) out[c] = row[c] ?? null;
  return out;
}
