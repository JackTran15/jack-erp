import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DEBT_REPORT_KEYS,
  InvoiceReportResult,
  ReportCellValue,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ProviderEntity } from '../../../inventory/location/provider.entity';
import { SupplierDebtPaymentEntity } from '../../../inventory/supplier-debt/supplier-debt-payment.entity';
import { SupplierDebtEntity } from '../../../inventory/supplier-debt/supplier-debt.entity';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { debtColumn } from '../debt-report-column.util';
import { DebtReportSearchDto } from '../dto/debt-report-search.dto';
import { ReportDefinition } from '../report-definition';
import {
  closeLedger,
  DebtPeriodService,
  PartyLedgerRow,
} from '../services/debt-period.service';

const COLUMNS = ['supplierCode', 'supplierName', 'debtOpening', 'debtIncrease', 'debtDecrease', 'debtClosing'] as const;
const NUMBER_COLUMNS = new Set(['debtOpening', 'debtIncrease', 'debtDecrease', 'debtClosing']);

interface SupplierDebtBucket extends PartyLedgerRow {
  code: string;
  name: string;
}

function cellValue(col: string, b: SupplierDebtBucket): ReportCellValue {
  switch (col) {
    case 'supplierCode':
      return b.code;
    case 'supplierName':
      return b.name;
    case 'debtOpening':
      return b.opening;
    case 'debtIncrease':
      return b.increase;
    case 'debtDecrease':
      return b.decrease;
    case 'debtClosing':
      return b.closing;
    default:
      return null;
  }
}

function buildRow(columns: string[], b: SupplierDebtBucket): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = cellValue(col, b);
  return row;
}

function buildTotals(columns: string[], buckets: SupplierDebtBucket[]): ReportRow {
  const totals: ReportRow = {};
  for (const col of columns) {
    totals[col] = NUMBER_COLUMNS.has(col)
      ? buckets.reduce((sum, b) => sum + (Number(cellValue(col, b)) || 0), 0)
      : null;
  }
  return totals;
}

/**
 * "Công nợ nhà cung cấp" — one row per supplier, period ledger
 * (opening/increase/decrease/closing). Only 2 fixed columns (supplierCode,
 * supplierName); mặc định gộp toàn chuỗi/tổ chức, có thể thu hẹp về 1 chi
 * nhánh cụ thể qua `filters.branchId` (khác báo cáo #1/#2 — công nợ khách hàng
 * luôn gộp không có filter phụ, xem docs/24-debt-reports-spec.md #3).
 */
@Injectable()
export class SupplierDebtsReport implements ReportDefinition {
  readonly key = DEBT_REPORT_KEYS.SUPPLIER_DEBTS;

  constructor(
    private readonly debtPeriod: DebtPeriodService,
    @InjectRepository(SupplierDebtEntity)
    private readonly supplierDebts: Repository<SupplierDebtEntity>,
    @InjectRepository(SupplierDebtPaymentEntity)
    private readonly supplierDebtPayments: Repository<SupplierDebtPaymentEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    return [
      debtColumn('supplierCode', ReportColumnDataType.STRING),
      debtColumn('supplierName', ReportColumnDataType.STRING),
      debtColumn('debtOpening', ReportColumnDataType.CURRENCY),
      debtColumn('debtIncrease', ReportColumnDataType.CURRENCY),
      debtColumn('debtDecrease', ReportColumnDataType.CURRENCY),
      debtColumn('debtClosing', ReportColumnDataType.CURRENCY),
    ];
  }

  async buildData(
    dto: DebtReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const period = dto.filters.period;
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.period.from/to is required');
    }

    const ledger = await this.debtPeriod.getPeriodLedger(
      {
        repo: this.supplierDebts,
        partyIdExpr: 't.supplierId',
        amountExpr: 't.originalAmount',
        dateExpr: 't.issuedAt',
        branchIdExpr: 't.branchId',
      },
      {
        repo: this.supplierDebtPayments,
        partyIdExpr: 'debt.supplierId',
        amountExpr: 't.amount',
        dateExpr: 't.paidAt',
        branchIdExpr: 'debt.branchId',
        join: (qb) => qb.innerJoin(SupplierDebtEntity, 'debt', 'debt.id = t.debtId'),
      },
      {
        organizationId: actor.organizationId,
        branchIds: dto.filters.branchId ? [dto.filters.branchId] : undefined,
        fromDate: period.from,
        toDate: period.to,
      },
    );
    const closed = ledger.map(closeLedger);
    if (!closed.length) {
      return { rows: [], totals: null, total: 0 };
    }

    const supplierIds = closed.map((r) => r.partyId);
    const providers = await this.providers.find({
      where: {
        organizationId: actor.organizationId,
        id: In(supplierIds),
        ...(dto.filters.supplierGroupId ? { groupId: dto.filters.supplierGroupId } : {}),
      },
    });
    const providerById = new Map(providers.map((p) => [p.id, p]));

    const buckets: SupplierDebtBucket[] = closed
      .filter((r) => providerById.has(r.partyId))
      .map((r) => {
        const provider = providerById.get(r.partyId)!;
        return { ...r, code: provider.code, name: provider.name };
      });

    const filtered = dto.columnFilters?.length
      ? buckets.filter((b) =>
          dto.columnFilters!.every((f) => matchColumnFilter(cellValue(f.col, b), f)),
        )
      : buckets;

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);

    return {
      rows: pageRows.map((b) => buildRow(dto.columns, b)),
      totals: buildTotals(dto.columns, filtered),
      total,
    };
  }
}

export const SUPPLIER_DEBTS_COLUMNS: readonly string[] = COLUMNS;
