import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DEBT_REPORT_KEYS,
  InvoiceReportResult,
  ReceivableStatus,
  ReportCellValue,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { ReceivableEntity } from '../../../accounting/receivables/receivable.entity';
import { ReceivableSettlementEntity } from '../../../accounting/receivables/receivable-settlement.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CustomerGroupEntity } from '../../../customer/customer-group.entity';
import { MembershipCardEntity } from '../../../customer/membership-card.entity';
import { DebtPaymentEntity } from '../../../pos/entities/debt-payment.entity';
import { InvoiceDebtEntity } from '../../../pos/entities/invoice-debt.entity';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { debtColumn } from '../debt-report-column.util';
import { DebtReportSearchDto } from '../dto/debt-report-search.dto';
import { ReportDefinition } from '../report-definition';
import {
  closeLedger,
  DebtPeriodService,
  mergeLedgerDeltas,
  PartyLedgerRow,
} from '../services/debt-period.service';

const COLUMNS = [
  'customerCode',
  'customerName',
  'customerGroup',
  'customerPhone',
  'customerEmail',
  'debtOpening',
  'debtIncrease',
  'debtDecrease',
  'debtClosing',
  'address',
  'membershipCardNumber',
  'membershipTier',
] as const;

const NUMBER_COLUMNS = new Set(['debtOpening', 'debtIncrease', 'debtDecrease', 'debtClosing']);

/** Receivable lifecycle states that represent a real, booked debt (excludes DRAFT/VOIDED). */
const BOOKED_RECEIVABLE_STATUSES = [
  ReceivableStatus.POSTED,
  ReceivableStatus.PARTIALLY_SETTLED,
  ReceivableStatus.SETTLED,
  ReceivableStatus.WRITTEN_OFF,
];

interface CustomerDebtBucket extends PartyLedgerRow {
  code: string;
  name: string;
  groupName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  membershipCardNumber: string | null;
  membershipTier: string | null;
}

function cellValue(col: string, b: CustomerDebtBucket): ReportCellValue {
  switch (col) {
    case 'customerCode':
      return b.code;
    case 'customerName':
      return b.name;
    case 'customerGroup':
      return b.groupName;
    case 'customerPhone':
      return b.phone;
    case 'customerEmail':
      return b.email;
    case 'debtOpening':
      return b.opening;
    case 'debtIncrease':
      return b.increase;
    case 'debtDecrease':
      return b.decrease;
    case 'debtClosing':
      return b.closing;
    case 'address':
      return b.address;
    case 'membershipCardNumber':
      return b.membershipCardNumber;
    case 'membershipTier':
      return b.membershipTier;
    default:
      return null;
  }
}

function buildRow(columns: string[], b: CustomerDebtBucket): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = cellValue(col, b);
  return row;
}

function buildTotals(columns: string[], buckets: CustomerDebtBucket[]): ReportRow {
  const totals: ReportRow = {};
  for (const col of columns) {
    totals[col] = NUMBER_COLUMNS.has(col)
      ? buckets.reduce((sum, b) => sum + (Number(cellValue(col, b)) || 0), 0)
      : null;
  }
  return totals;
}

/**
 * "Công nợ khách hàng" — one row per customer, period ledger
 * (opening/increase/decrease/closing) ALWAYS aggregated across every branch
 * the customer traded with, regardless of the store-selector mode (confirmed
 * business rule — see docs/24-debt-reports-spec.md #1). Merges two ledger
 * sides per the product decision "cả hai": POS credit-invoice debt
 * (InvoiceDebtEntity/DebtPaymentEntity) and the accounting receivables ledger
 * (ReceivableEntity/ReceivableSettlementEntity).
 */
@Injectable()
export class CustomerDebtsReport implements ReportDefinition {
  readonly key = DEBT_REPORT_KEYS.CUSTOMER_DEBTS;

  constructor(
    private readonly debtPeriod: DebtPeriodService,
    @InjectRepository(InvoiceDebtEntity)
    private readonly invoiceDebts: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly debtPayments: Repository<DebtPaymentEntity>,
    @InjectRepository(ReceivableEntity)
    private readonly receivables: Repository<ReceivableEntity>,
    @InjectRepository(ReceivableSettlementEntity)
    private readonly settlements: Repository<ReceivableSettlementEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(CustomerGroupEntity)
    private readonly customerGroups: Repository<CustomerGroupEntity>,
    @InjectRepository(MembershipCardEntity)
    private readonly membershipCards: Repository<MembershipCardEntity>,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    return [
      debtColumn('customerCode', ReportColumnDataType.STRING),
      debtColumn('customerName', ReportColumnDataType.STRING),
      debtColumn('customerGroup', ReportColumnDataType.STRING),
      debtColumn('customerPhone', ReportColumnDataType.STRING),
      debtColumn('customerEmail', ReportColumnDataType.STRING),
      debtColumn('debtOpening', ReportColumnDataType.CURRENCY),
      debtColumn('debtIncrease', ReportColumnDataType.CURRENCY),
      debtColumn('debtDecrease', ReportColumnDataType.CURRENCY),
      debtColumn('debtClosing', ReportColumnDataType.CURRENCY),
      debtColumn('address', ReportColumnDataType.STRING),
      debtColumn('membershipCardNumber', ReportColumnDataType.STRING),
      debtColumn('membershipTier', ReportColumnDataType.STRING),
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

    const params = {
      organizationId: actor.organizationId,
      fromDate: period.from,
      toDate: period.to,
    };

    const [posLedger, arLedger] = await Promise.all([
      this.debtPeriod.getPeriodLedger(
        {
          repo: this.invoiceDebts,
          partyIdExpr: 't.customerId',
          amountExpr: 't.originalAmount',
          dateExpr: 't.issuedAt',
        },
        {
          repo: this.debtPayments,
          partyIdExpr: 'debt.customerId',
          amountExpr: 't.amount',
          dateExpr: 't.paidAt',
          join: (qb) =>
            qb.innerJoin(InvoiceDebtEntity, 'debt', 'debt.id = t.debtId'),
        },
        params,
      ),
      this.debtPeriod.getPeriodLedger(
        {
          repo: this.receivables,
          partyIdExpr: 't.customerId',
          amountExpr: 't.amount',
          dateExpr: 't.postedAt',
          filter: (qb) =>
            qb.andWhere('t.status IN (:...bookedStatuses)', {
              bookedStatuses: BOOKED_RECEIVABLE_STATUSES,
            }),
        },
        {
          repo: this.settlements,
          partyIdExpr: 'rec.customerId',
          amountExpr: 't.amount',
          dateExpr: 't.settlementDate',
          join: (qb) =>
            qb.innerJoin(ReceivableEntity, 'rec', 'rec.id = t.receivableId'),
        },
        params,
      ),
    ]);

    const merged = mergeLedgerDeltas([posLedger, arLedger]).map(closeLedger);
    if (!merged.length) {
      return { rows: [], totals: null, total: 0 };
    }

    const customerIds = merged.map((r) => r.partyId);
    const customers = await this.customers.find({
      where: {
        organizationId: actor.organizationId,
        id: In(customerIds),
        ...(dto.filters.customerGroupId
          ? { groupId: dto.filters.customerGroupId }
          : {}),
      },
    });
    const customerById = new Map(customers.map((c) => [c.id, c]));

    const groupIds = [
      ...new Set(customers.map((c) => c.groupId).filter((v): v is string => !!v)),
    ];
    const groups = groupIds.length
      ? await this.customerGroups.find({ where: { id: In(groupIds) } })
      : [];
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

    const cards = customerIds.length
      ? await this.membershipCards.find({ where: { customerId: In(customerIds) } })
      : [];
    const cardByCustomerId = new Map(cards.map((c) => [c.customerId, c]));

    const buckets: CustomerDebtBucket[] = merged
      .filter((r) => customerById.has(r.partyId))
      .map((r) => {
        const customer = customerById.get(r.partyId)!;
        const card = cardByCustomerId.get(r.partyId);
        return {
          ...r,
          code: customer.code,
          name: customer.name,
          groupName: customer.groupId
            ? (groupNameById.get(customer.groupId) ?? null)
            : null,
          phone: customer.phone ?? null,
          email: customer.email ?? null,
          address: customer.address ?? null,
          membershipCardNumber: card?.cardNumber ?? null,
          membershipTier: card?.tier ?? null,
        };
      });

    const filtered = dto.columnFilters?.length
      ? buckets.filter((b) =>
          dto.columnFilters!.every((f) =>
            matchColumnFilter(cellValue(f.col, b), f),
          ),
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

export const CUSTOMER_DEBTS_COLUMNS: readonly string[] = COLUMNS;
