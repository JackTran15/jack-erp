import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { StringFilterDto, StringOperator } from '../../../common/filters/filter.dto';
import { UserEntity } from '../../auth/user.entity';
import { InvoiceDebtEntity } from '../../pos/entities/invoice-debt.entity';
import { InvoiceEntity, InvoiceStatus } from '../../pos/entities/invoice.entity';
import {
  BranchDeliveryOrderRow,
  BranchDeliveryTab,
  BranchSalesOrderDateField,
  BranchSalesOrderRow,
  BranchSalesOrderView,
  SearchBranchSalesOrdersDto,
  SearchBranchSalesOrdersResult,
} from '../dto/search-branch-sales-orders.dto';
import { DeliveryStatus, SalesOrderEntity, SalesOrderStatus } from '../entities/sales-order.entity';
import { DELIVERY_TRANSITIONS } from '../sales-order.constants';
import { SearchBranchSalesOrdersQuery } from './search-branch-sales-orders.query';

/** Source columns behind the composed "Thông tin giao hàng" cell. */
const DELIVERY_INFO_COLUMNS = [
  'so.recipientName',
  'so.recipientPhone',
  'so.shipAddressLine',
  'so.shipWardName',
  'so.shipProvinceName',
];

const DATE_COLUMN: Record<BranchSalesOrderDateField, string> = {
  [BranchSalesOrderDateField.CREATED]: 'so.createdAt',
  [BranchSalesOrderDateField.DELIVERED]: 'so.deliveredAt',
  [BranchSalesOrderDateField.INVOICED]: 'inv.issuedAt',
};

/**
 * POS order grids (ADR-03): branch-scoped search over `sales_orders`.
 *
 * Scope is hard — `organizationId` and the caller's active branch — and never
 * comes from the body.
 */
@QueryHandler(SearchBranchSalesOrdersQuery)
export class SearchBranchSalesOrdersHandler
  implements IQueryHandler<SearchBranchSalesOrdersQuery>
{
  constructor(
    @InjectRepository(SalesOrderEntity)
    private readonly repo: Repository<SalesOrderEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    // `invoice_debts` / `users` are not in this module's `forFeature`; read them
    // through the manager, like `SalesOrderHistoryService`.
    private readonly dataSource: DataSource,
  ) {}

  async execute({ dto, actor }: SearchBranchSalesOrdersQuery): Promise<SearchBranchSalesOrdersResult> {
    const delivery = dto.view === BranchSalesOrderView.DELIVERY;
    if (!delivery && !dto.channelId) {
      throw new BadRequestException('channelId is required for the ONLINE view');
    }
    // BranchScopeGuard + @RequireBranchScope guarantee this; without it the
    // branch predicate would bind `undefined`, so refuse rather than guess.
    if (!actor.branchId) {
      throw new BadRequestException('An active branch is required');
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // offset/limit rather than skip/take: every join is to-one (invoice by id,
    // debt by its UNIQUE invoice_id) and unselected, so rows cannot multiply and
    // the DISTINCT pre-query that skip/take adds for joined builders is pure cost.
    const [orders, total] = await this.buildQuery(dto, actor, actor.branchId)
      .orderBy('so.createdAt', 'DESC')
      .addOrderBy('so.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    if (delivery) {
      return { data: await this.toDeliveryRows(orders, actor.organizationId), total, page, limit };
    }

    const invoiceCodes = await this.invoiceCodesOf(orders, actor.organizationId);

    return {
      data: orders.map((order) => this.toRow(order, invoiceCodes)),
      total,
      page,
      limit,
    };
  }

  private buildQuery(
    dto: SearchBranchSalesOrdersDto,
    actor: ActorContext,
    branchId: string,
  ): SelectQueryBuilder<SalesOrderEntity> {
    const delivery = dto.view === BranchSalesOrderView.DELIVERY;
    const qb = this.repo
      .createQueryBuilder('so')
      // Many-to-one; carries organizationId so the join cannot cross tenants.
      // Needed by the "Số hoá đơn" filter, the INVOICED date field and the
      // PAID/UNPAID tabs.
      .leftJoin(
        InvoiceEntity,
        'inv',
        'inv.id = so.invoiceId AND inv.organizationId = so.organizationId',
      );
    if (delivery) {
      // `invoice_debts.invoice_id` is UNIQUE — one debt per invoice — so this
      // stays to-one. Only the "Còn phải thu" filter reads it.
      qb.leftJoin(
        InvoiceDebtEntity,
        'debt',
        'debt.invoiceId = inv.id AND debt.organizationId = so.organizationId',
      );
    }
    qb.where('so.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('so.branchId = :branchId', { branchId });

    if (delivery) {
      this.applyDeliveryScope(qb, dto);
    } else {
      // Not a user filter: drafts belong to the salesperson until sent (A-13).
      qb.andWhere('so.status != :draftStatus', { draftStatus: SalesOrderStatus.DRAFT })
        .andWhere('so.salesChannelId = :channelId', { channelId: dto.channelId });
    }

    if (dto.status) {
      qb.andWhere('so.status = :status', { status: dto.status });
    }

    if (dto.stockShort !== undefined) {
      qb.andWhere('so.stockShort = :stockShort', { stockShort: dto.stockShort });
    }

    const cols = dto.columnFilters;
    new FilterBuilder(qb)
      // `applyDateRange` resolves a bare `YYYY-MM-DD` to Asia/Ho_Chi_Minh day
      // bounds, so "Hôm nay" means the local day whatever the session TZ is.
      .applyDateRange(DATE_COLUMN[dto.dateField ?? BranchSalesOrderDateField.CREATED], {
        from: dto.from,
        to: dto.to,
      })
      .applyString('so.externalOrderId', cols?.externalOrderId)
      .applyDateRange('so.createdAt', cols?.orderDate)
      .applyCompare('so.amountDue', cols?.amountDue)
      .applyEnum('so.status', cols?.status?.value)
      .applyString('so.deliveryPartnerName', cols?.deliveryPartnerName)
      .applyString('so.salespersonName', cols?.salespersonName)
      .applyString('inv.code', cols?.invoiceCode)
      .applyString('so.note', cols?.note);

    this.applyAnyColumnString(qb, DELIVERY_INFO_COLUMNS, cols?.deliveryInfo);

    if (delivery) {
      new FilterBuilder(qb)
        .applyDateRange('so.deliveredAt', cols?.deliveredAt)
        .applyDateRange('inv.issuedAt', cols?.invoiceDate)
        .applyString('so.customerName', cols?.customerName)
        .applyString('so.trackingCode', cols?.trackingCode)
        .applyString('so.packageInfo', cols?.packageInfo)
        .applyString('so.salesChannel', cols?.salesChannel)
        .applyEnum('so.deliveryStatus', cols?.deliveryStatus?.value)
        .applyCompare('inv.shippingFeeAmount', cols?.shippingFeeCustomer)
        .applyCompare('inv.depositAmount', cols?.deposit)
        // Same 0-without-a-debt the row shows, so `= 0` finds debt-free orders.
        .applyCompare('COALESCE(debt.remainingAmount, 0)', cols?.remainingReceivable)
        .applyCompare('so.partnerShippingFee', cols?.partnerShippingFee);
    }

    return qb;
  }

  /**
   * DELIVERY scope: orders in the delivery lifecycle (`delivery_status` set by
   * `approve`), narrowed by the tab. The channel is optional here — the
   * delivery grid has no channel sidebar.
   */
  private applyDeliveryScope(qb: SelectQueryBuilder<SalesOrderEntity>, dto: SearchBranchSalesOrdersDto): void {
    qb.andWhere('so.deliveryStatus IS NOT NULL');
    if (dto.channelId) {
      qb.andWhere('so.salesChannelId = :channelId', { channelId: dto.channelId });
    }

    const cancelled = { cancelledStatus: SalesOrderStatus.CANCELLED };
    switch (dto.deliveryTab) {
      case undefined:
        return;
      case BranchDeliveryTab.CANCELLED:
        qb.andWhere('so.status = :cancelledStatus', cancelled);
        return;
      // A-06: payment tabs are derived from the invoice, not stored.
      case BranchDeliveryTab.PAID:
        qb.andWhere('inv.status = :paidStatus', { paidStatus: InvoiceStatus.PAID });
        return;
      case BranchDeliveryTab.UNPAID:
        // Parenthesised: an escaping OR would void the tenant/branch predicates.
        // The cancelled guard matters for drafts: an order cancelled after
        // "Nhận xử lý" but before checkout leaves its draft invoice cancelled
        // with `is_draft` still true — that is not "Lưu tạm". (PAID needs no
        // guard: `status = paid` cannot match a cancelled invoice.)
        qb.andWhere(
          '(inv.status != :invoiceCancelledStatus AND (inv.isDraft = true OR inv.status IN (:...unpaidStatuses)))',
          {
            invoiceCancelledStatus: InvoiceStatus.CANCELLED,
            unpaidStatuses: [InvoiceStatus.DEBT, InvoiceStatus.PARTIAL_DEBT],
          },
        );
        return;
      // RETURNED is itself a cancellation (ADR-04), so it keeps its CANCELLED rows.
      case BranchDeliveryTab.RETURNED:
        qb.andWhere('so.deliveryStatus = :deliveryTab', { deliveryTab: dto.deliveryTab });
        return;
      default:
        qb.andWhere('so.deliveryStatus = :deliveryTab', { deliveryTab: dto.deliveryTab })
          .andWhere('so.status != :cancelledStatus', cancelled);
    }
  }

  /**
   * One operator-aware string filter matched against several columns: a row
   * qualifies when ANY column matches — except `!` (not contains), which must
   * hold for EVERY column, else a row whose name lacks the term but whose
   * address has it would slip through. `FilterBuilder.applyString` ANDs one
   * column at a time and `applyOrString` is contains-only, so neither fits.
   *
   * The group is wrapped in one pair of parens inside one `andWhere`; without
   * them the OR would escape and void the tenant/branch predicates.
   */
  private applyAnyColumnString(
    qb: SelectQueryBuilder<SalesOrderEntity>,
    columns: string[],
    filter?: StringFilterDto,
  ): void {
    if (!filter?.value?.trim()) return;
    const value = filter.value;

    const shapes: Record<StringOperator, { sql: (col: string) => string; param: string; joiner: string }> = {
      [StringOperator.CONTAINS]: { sql: (c) => `${c} ILIKE :deliveryInfo`, param: `%${value}%`, joiner: ' OR ' },
      [StringOperator.EQUALS]: { sql: (c) => `${c} = :deliveryInfo`, param: value, joiner: ' OR ' },
      [StringOperator.STARTS_WITH]: { sql: (c) => `${c} ILIKE :deliveryInfo`, param: `${value}%`, joiner: ' OR ' },
      [StringOperator.ENDS_WITH]: { sql: (c) => `${c} ILIKE :deliveryInfo`, param: `%${value}`, joiner: ' OR ' },
      [StringOperator.NOT_CONTAINS]: {
        sql: (c) => `COALESCE(${c}, '') NOT ILIKE :deliveryInfo`,
        param: `%${value}%`,
        joiner: ' AND ',
      },
    };
    const shape = shapes[filter.operator];

    qb.andWhere(`(${columns.map(shape.sql).join(shape.joiner)})`, { deliveryInfo: shape.param });
  }

  /**
   * DELIVERY rows: invoice, debt and cashier name for the whole page in one
   * org-scoped read each — never per row.
   */
  private async toDeliveryRows(
    orders: SalesOrderEntity[],
    organizationId: string,
  ): Promise<BranchDeliveryOrderRow[]> {
    const invoiceIds = distinct(orders.map((o) => o.invoiceId));
    const approverIds = distinct(orders.map((o) => o.approvedBy));

    const [invoices, debts, cashiers] = await Promise.all([
      invoiceIds.length
        ? this.invoiceRepo.find({
            where: { id: In(invoiceIds), organizationId },
            select: ['id', 'code', 'issuedAt', 'isDraft', 'shippingFeeAmount', 'depositAmount'],
          })
        : [],
      invoiceIds.length
        ? this.dataSource.manager.find(InvoiceDebtEntity, {
            where: { invoiceId: In(invoiceIds), organizationId },
            select: ['id', 'invoiceId', 'remainingAmount'],
          })
        : [],
      approverIds.length
        ? this.dataSource.manager.find(UserEntity, {
            where: { id: In(approverIds), organizationId },
            select: ['id', 'firstName', 'lastName'],
          })
        : [],
    ]);

    const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
    const debtByInvoice = new Map(debts.map((d) => [d.invoiceId, d]));
    const cashierName = new Map(
      cashiers.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]),
    );
    const codes = new Map(invoices.map((inv) => [inv.id, inv.code]));

    return orders.map((order) => {
      const invoice = order.invoiceId ? invoiceById.get(order.invoiceId) : undefined;
      const debt = order.invoiceId ? debtByInvoice.get(order.invoiceId) : undefined;
      // Numeric columns arrive as strings whatever the entity type says.
      const remaining = debt ? Number(debt.remainingAmount) : 0;
      // The view guarantees a delivery status.
      const deliveryStatus = order.deliveryStatus as DeliveryStatus;
      return {
        ...this.toRow(order, codes),
        deliveryStatus,
        allowedNextStatuses:
          order.status === SalesOrderStatus.CANCELLED ? [] : [...DELIVERY_TRANSITIONS[deliveryStatus]],
        deliveredAt: order.deliveredAt,
        invoiceDate: invoice?.issuedAt ?? null,
        invoiceIsDraft: invoice ? invoice.isDraft : null,
        cashierName: order.approvedBy ? cashierName.get(order.approvedBy) ?? null : null,
        customerName: order.customerName,
        salesChannel: order.salesChannel,
        orderType: 'ORDER',
        trackingCode: order.trackingCode,
        packageInfo: order.packageInfo,
        shippingFeeCustomer: invoice ? Number(invoice.shippingFeeAmount) : 0,
        deposit: invoice ? Number(invoice.depositAmount) : 0,
        customerDebt: remaining,
        remainingReceivable: remaining,
        cod: 0,
        partnerShippingFee: order.partnerShippingFee === null ? null : Number(order.partnerShippingFee),
        debtId: debt?.id ?? null,
      };
    });
  }

  /** Invoice codes for the page in one org-scoped read. */
  private async invoiceCodesOf(
    orders: SalesOrderEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(orders.map((o) => o.invoiceId).filter((id): id is string => !!id))];
    if (!ids.length) return new Map();
    const invoices = await this.invoiceRepo.find({
      where: { id: In(ids), organizationId },
      select: ['id', 'code'],
    });
    return new Map(invoices.map((inv) => [inv.id, inv.code]));
  }

  private toRow(order: SalesOrderEntity, invoiceCodes: Map<string, string>): BranchSalesOrderRow {
    return {
      id: order.id,
      status: order.status,
      stockShort: order.stockShort,
      externalOrderId: order.externalOrderId,
      createdAt: order.createdAt,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      shipAddressLine: order.shipAddressLine,
      shipWardName: order.shipWardName,
      shipProvinceName: order.shipProvinceName,
      // numeric(18,2) arrives from TypeORM as a string.
      amountDue: Number(order.amountDue),
      deliveryPartnerName: order.deliveryPartnerName,
      salespersonName: order.salespersonName,
      invoiceId: order.invoiceId,
      invoiceCode: order.invoiceId ? invoiceCodes.get(order.invoiceId) ?? null : null,
      note: order.note,
    };
  }
}

function distinct(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}
