import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InvoiceReportResult,
  REPORT_ROW_INVOICE_ID,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { toBusinessDate } from '../../../../common/utils/business-timezone.util';
import { ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { PROFIT_CONSOLIDATED, resolveReportBranchIds } from '../../report-core/report-query.util';
import { BusinessResultsSource } from '../business-results.source';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';
import { enrichHeader } from '../report-column.util';
import { ReportDefinition } from '../report-definition';

const COLUMNS: { key: string; name: string; type: ReportColumnDataType; width: number }[] = [
  { key: 'ngayHoaDon', name: 'Ngày hóa đơn', type: ReportColumnDataType.DATE, width: 110 },
  { key: 'soHoaDon', name: 'Số hóa đơn', type: ReportColumnDataType.STRING, width: 130 },
  { key: 'loaiChungTu', name: 'Loại chứng từ', type: ReportColumnDataType.STRING, width: 200 },
  { key: 'dienGiai', name: 'Diễn giải', type: ReportColumnDataType.STRING, width: 380 },
  { key: 'giaTriXuat', name: 'Giá trị xuất', type: ReportColumnDataType.CURRENCY, width: 130 },
  { key: 'giaTriNhap', name: 'Giá trị nhập', type: ReportColumnDataType.CURRENCY, width: 130 },
];
const KNOWN = new Set(COLUMNS.map((c) => c.key));

/**
 * "Chi tiết chi phí giá vốn hàng hóa" — the invoices behind 3.1 / 3.1.1 / 3.1.2
 * of "Kết quả kinh doanh", one row per invoice and stock direction (an EXCHANGE
 * invoice gives an out row and an in row). Value = Σ quantity × costPrice of
 * its lines, the same figure the statement sums.
 *
 * POS invoices move stock straight through the ledger — there is no separate
 * goods-issue document number to show, so the invoice is the document.
 */
@Injectable()
export class BusinessResultsCogsReport implements ReportDefinition {
  readonly key = 'business-results-cogs';

  constructor(
    private readonly source: BusinessResultsSource,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(_actor: ActorContext): Promise<ReportColumnHeader[]> {
    return COLUMNS.map((c) => ({
      ...enrichHeader({ col: c.key, name: c.name, desc: null, type: c.type, group: null }),
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
    const qb = this.source.invoiceLineQuery({
      organizationId: actor.organizationId,
      branchIds: resolveReportBranchIds(hasConsolidated, dto.filters.store, dto.filters.branchId, actor),
      from: period.from,
      to: period.to,
    });
    const cogsDirection = dto.filters.cogsDirection;
    if (cogsDirection) {
      qb.andWhere('li.direction = :cogsDirection', {
        cogsDirection: cogsDirection === 'in' ? ItemDirection.IN : ItemDirection.OUT,
      });
    }

    const raw = await qb
      .select('invoice.id', 'invoiceId')
      .addSelect('invoice.code', 'code')
      .addSelect('invoice.issuedAt', 'issuedAt')
      .addSelect('li.direction', 'direction')
      .addSelect('COALESCE(SUM(li.quantity * li.costPrice), 0)', 'cogs')
      .groupBy('invoice.id')
      .addGroupBy('invoice.code')
      .addGroupBy('invoice.issuedAt')
      .addGroupBy('li.direction')
      .orderBy('invoice.issuedAt', 'ASC')
      .addOrderBy('invoice.code', 'ASC')
      .addOrderBy('li.direction', 'DESC')
      .getRawMany<{
        invoiceId: string;
        code: string;
        issuedAt: Date;
        direction: ItemDirection;
        cogs: string;
      }>();

    let rows: ReportRow[] = raw.map((r) => {
      const isReturn = r.direction === ItemDirection.IN;
      const value = Number(r.cogs ?? 0);
      return {
        ngayHoaDon: toBusinessDate(new Date(r.issuedAt)),
        soHoaDon: r.code,
        loaiChungTu: isReturn ? 'Nhập kho hàng trả lại' : 'Xuất kho bán hàng',
        dienGiai: isReturn
          ? `Nhập kho hàng trả lại theo hóa đơn số ${r.code}`
          : `Xuất kho bán hàng theo hóa đơn số ${r.code}`,
        giaTriXuat: isReturn ? 0 : value,
        giaTriNhap: isReturn ? value : 0,
        [REPORT_ROW_INVOICE_ID]: r.invoiceId,
      };
    });

    if (dto.columnFilters?.length) {
      rows = rows.filter((row) => dto.columnFilters!.every((f) => matchColumnFilter(row[f.col] ?? null, f)));
    }

    const sum = (key: string) =>
      Math.round(rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) * 100) / 100;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const pageRows = rows.slice((page - 1) * limit, page * limit).map((row) => {
      const out: ReportRow = { [REPORT_ROW_INVOICE_ID]: row[REPORT_ROW_INVOICE_ID] };
      for (const c of dto.columns) out[c] = row[c] ?? null;
      return out;
    });

    return {
      rows: pageRows,
      totals: rows.length ? { giaTriXuat: sum('giaTriXuat'), giaTriNhap: sum('giaTriNhap') } : null,
      total: rows.length,
    };
  }
}
