import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INVOICE_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnHeader,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { UserEntity } from '../../../auth/user.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CustomerGroupEntity } from '../../../customer/customer-group.entity';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { ItemProviderEntity } from '../../../inventory/location/item-provider.entity';
import { LocationEntity } from '../../../inventory/location/location.entity';
import { ProviderEntity } from '../../../inventory/location/provider.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { InvoiceReportSearchDto } from '../dto/invoice-report-search.dto';
import { matchColumnFilter } from '../invoice-report.aggregator';
import {
  isKnownItemRevenueColumn,
  INVOICE_ITEM_REVENUE_COLUMNS,
} from '../invoice-item-revenue.columns';
import {
  buildItemRow,
  buildItemTotals,
  InvoiceItemRowInput,
  itemCellValue,
} from '../invoice-item-revenue.aggregator';
import { enrichHeader } from '../report-column.util';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  resolveBranchIds,
  statDateColumn,
} from '../report-query.util';
import { ReportDefinition } from '../report-definition';

const fullName = (u?: { firstName?: string; lastName?: string }): string | null => {
  if (!u) return null;
  const name = [u.lastName, u.firstName].filter(Boolean).join(' ').trim();
  return name || null;
};

/** MISA-style revenue detail by invoice & item — one row per invoice line item (status != cancelled). */
@Injectable()
export class InvoiceItemRevenueDetailReport implements ReportDefinition {
  readonly key = 'invoice-item-revenue-detail';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly lineItems: Repository<InvoiceItemEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(CustomerGroupEntity)
    private readonly customerGroups: Repository<CustomerGroupEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employees: Repository<EmployeeProfileEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ItemEntity)
    private readonly catalogItems: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
    @InjectRepository(ItemProviderEntity)
    private readonly itemProviders: Repository<ItemProviderEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providers: Repository<ProviderEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(_actor: ActorContext): Promise<ReportColumnHeader[]> {
    // Flat catalog — no bands and no dynamic payment-method columns. `desc` is
    // null: values are direct line fields, not MISA formula derivations.
    return INVOICE_ITEM_REVENUE_COLUMNS.map((c) =>
      enrichHeader({
        col: c.key,
        name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: null,
        type: c.type,
        group: null,
      }),
    );
  }

  async buildData(
    dto: InvoiceReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 31;

    if (!dto.filters?.issuedAt?.from) {
      throw new BadRequestException('filters.issuedAt.from is required');
    }

    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => !isKnownItemRevenueColumn(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CONSOLIDATED_PERMISSION,
    );
    const branchIds = resolveBranchIds(
      hasConsolidated,
      dto.filters.store,
      dto.branchId ?? dto.filters.branchId,
      actor,
    );

    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId });
    applyBranchScope(qb, 'invoice', branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', dto.filters);
    new FilterBuilder(qb)
      .applyDateRange(statDateColumn('invoice', dto.filters), dto.filters.issuedAt)
      .applyEnum('invoice.type', dto.filters.type?.value)
      .applyEnum('invoice.customerId', dto.filters.customerId)
      .applyEnum('invoice.staffId', dto.filters.cashierId)
      .applyEnum('invoice.salespersonId', dto.filters.salespersonId);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);
    const invoiceById = new Map(invoiceRows.map((i) => [i.id, i]));

    let lines = invoiceRows.length
      ? await this.lineItems.find({
          where: { invoiceId: In([...invoiceById.keys()]) },
        })
      : [];

    // Filter lines by item category (Nhóm hàng hóa) when requested.
    if (dto.filters.categoryId && lines.length) {
      const itemIds = [
        ...new Set(lines.map((l) => l.itemId).filter((id): id is string => !!id)),
      ];
      const items = itemIds.length
        ? await this.catalogItems.find({
            where: { id: In(itemIds), organizationId: actor.organizationId },
          })
        : [];
      const categoryByItem = new Map(items.map((i) => [i.id, i.categoryId ?? null]));
      lines = lines.filter(
        (l) => categoryByItem.get(l.itemId) === dto.filters.categoryId,
      );
    }

    // Fetch only the auxiliary data the requested columns actually need.
    const needsCustomer = ['customer', 'customerCode', 'customerPhone', 'customerGroup'].some(
      (c) => referenced.includes(c),
    );
    const needsCustomerGroup = referenced.includes('customerGroup');
    const needsStore = referenced.includes('storeCode') || referenced.includes('storeName');
    const needsCashier = referenced.includes('cashier') || referenced.includes('cashierCode');
    const needsSalesperson =
      referenced.includes('salesperson') || referenced.includes('salespersonCode');
    const needsCategory = referenced.includes('itemCategory');
    const needsSupplier = referenced.includes('supplier');
    const needsLocation =
      referenced.includes('locationCode') || referenced.includes('locationName');

    const customerById = needsCustomer
      ? await this.loadCustomers(invoiceRows, actor.organizationId)
      : new Map<string, CustomerEntity>();
    const customerGroupById = needsCustomerGroup
      ? await this.loadCustomerGroups([...customerById.values()], actor.organizationId)
      : new Map<string, string>();
    const storeById = needsStore
      ? await this.loadBranches(invoiceRows, actor.organizationId)
      : new Map<string, string>();
    const cashierByStaffId = needsCashier
      ? await this.loadCashiers(invoiceRows, actor.organizationId)
      : new Map<string, { code: string | null; name: string | null }>();
    const salespersonById = needsSalesperson
      ? await this.loadSalespeople(invoiceRows, actor.organizationId)
      : new Map<string, { code: string | null; name: string | null }>();
    const categoryByItemId =
      needsCategory || needsSupplier
        ? await this.loadItemCategories(lines, actor.organizationId, needsCategory)
        : new Map<string, string>();
    const supplierByItemId = needsSupplier
      ? await this.loadSuppliers(lines, actor.organizationId)
      : new Map<string, string>();
    const locationById = needsLocation
      ? await this.loadLocations(lines, actor.organizationId)
      : new Map<string, { code: string | null; name: string | null }>();

    const rows: InvoiceItemRowInput[] = lines
      .map((li) => {
        const inv = invoiceById.get(li.invoiceId)!;
        const customer = inv.customerId ? customerById.get(inv.customerId) : undefined;
        const cashier = cashierByStaffId.get(inv.staffId);
        const salesperson = inv.salespersonId
          ? salespersonById.get(inv.salespersonId)
          : undefined;
        const location = li.locationId ? locationById.get(li.locationId) : undefined;
        return {
          invoiceId: li.invoiceId,
          sortOrder: li.sortOrder,
          issuedAt: inv.issuedAt!,
          invoiceCode: inv.code,
          invoiceNote: inv.note ?? null,
          itemCode: li.itemCode,
          itemName: li.itemName,
          unit: li.unit,
          direction: li.direction,
          quantity: Number(li.quantity ?? 0),
          unitPrice: Number(li.unitPrice ?? 0),
          lineDiscount: Number(li.lineDiscount ?? 0),
          lineTotal: Number(li.lineTotal ?? 0),
          itemNote: li.note ?? null,
          itemCategory: categoryByItemId.get(li.itemId) ?? null,
          locationCode: location?.code ?? null,
          locationName: location?.name ?? null,
          customerCode: customer?.code ?? null,
          customerName: customer?.name ?? null,
          customerGroup: customer?.groupId
            ? customerGroupById.get(customer.groupId) ?? null
            : null,
          customerPhone: customer?.phone ?? null,
          cashierCode: cashier?.code ?? null,
          cashierName: cashier?.name ?? null,
          salespersonCode: salesperson?.code ?? null,
          salespersonName: salesperson?.name ?? null,
          storeName: inv.branchId ? storeById.get(inv.branchId) ?? null : null,
          supplier: supplierByItemId.get(li.itemId) ?? null,
        };
      })
      .sort((a, b) => {
        const t = a.issuedAt.getTime() - b.issuedAt.getTime();
        if (t !== 0) return t;
        if (a.invoiceCode !== b.invoiceCode) {
          return a.invoiceCode.localeCompare(b.invoiceCode);
        }
        return a.sortOrder - b.sortOrder;
      });

    const filtered = dto.columnFilters?.length
      ? rows.filter((r) =>
          dto.columnFilters!.every((f) =>
            matchColumnFilter(itemCellValue(f.col, r), f),
          ),
        )
      : rows;

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);

    const rows2 = pageRows.map((r) => buildItemRow(dto.columns, r));
    const totals = filtered.length ? buildItemTotals(dto.columns, filtered) : null;

    return { rows: rows2, totals, total };
  }

  private async loadCustomers(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, CustomerEntity>> {
    const ids = [
      ...new Set(
        invoiceRows.map((i) => i.customerId).filter((id): id is string => !!id),
      ),
    ];
    const map = new Map<string, CustomerEntity>();
    if (!ids.length) return map;
    const rows = await this.customers.find({ where: { id: In(ids), organizationId } });
    for (const c of rows) map.set(c.id, c);
    return map;
  }

  private async loadCustomerGroups(
    customers: CustomerEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(customers.map((c) => c.groupId).filter((id): id is string => !!id)),
    ];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows = await this.customerGroups.find({ where: { id: In(ids), organizationId } });
    for (const g of rows) map.set(g.id, g.name);
    return map;
  }

  private async loadBranches(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        invoiceRows.map((i) => i.branchId).filter((id): id is string => !!id),
      ),
    ];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows = await this.branches.find({ where: { id: In(ids), organizationId } });
    for (const b of rows) map.set(b.id, b.name);
    return map;
  }

  /** Cashier: invoice.staffId references both employee_profiles.user_id and users.id. */
  private async loadCashiers(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, { code: string | null; name: string | null }>> {
    const ids = [...new Set(invoiceRows.map((i) => i.staffId).filter(Boolean))];
    const map = new Map<string, { code: string | null; name: string | null }>();
    if (!ids.length) return map;
    const [profiles, users] = await Promise.all([
      this.employees.find({ where: { userId: In(ids), organizationId } }),
      this.users.find({ where: { id: In(ids), organizationId } }),
    ]);
    const codeByUserId = new Map(profiles.map((e) => [e.userId, e.code]));
    const nameByUserId = new Map(users.map((u) => [u.id, fullName(u)]));
    for (const id of ids) {
      map.set(id, {
        code: codeByUserId.get(id) ?? null,
        name: nameByUserId.get(id) ?? null,
      });
    }
    return map;
  }

  /** Salesperson: invoice.salespersonId references employee_profiles.id (name via users). */
  private async loadSalespeople(
    invoiceRows: InvoiceEntity[],
    organizationId: string,
  ): Promise<Map<string, { code: string | null; name: string | null }>> {
    const ids = [
      ...new Set(
        invoiceRows.map((i) => i.salespersonId).filter((id): id is string => !!id),
      ),
    ];
    const map = new Map<string, { code: string | null; name: string | null }>();
    if (!ids.length) return map;
    const profiles = await this.employees.find({ where: { id: In(ids), organizationId } });
    const userIds = [...new Set(profiles.map((e) => e.userId))];
    const users = userIds.length
      ? await this.users.find({ where: { id: In(userIds), organizationId } })
      : [];
    const nameByUserId = new Map(users.map((u) => [u.id, fullName(u)]));
    for (const e of profiles) {
      map.set(e.id, { code: e.code, name: nameByUserId.get(e.userId) ?? null });
    }
    return map;
  }

  /** Item category name per itemId. Returns an empty map unless categories were requested. */
  private async loadItemCategories(
    lines: InvoiceItemEntity[],
    organizationId: string,
    enabled: boolean,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!enabled) return map;
    const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
    if (!itemIds.length) return map;
    const items = await this.catalogItems.find({
      where: { id: In(itemIds), organizationId },
    });
    const categoryIds = [
      ...new Set(items.map((i) => i.categoryId).filter((id): id is string => !!id)),
    ];
    if (!categoryIds.length) return map;
    const categories = await this.categories.find({
      where: { id: In(categoryIds), organizationId },
    });
    const nameByCategoryId = new Map(categories.map((c) => [c.id, c.name]));
    for (const i of items) {
      if (i.categoryId) {
        const name = nameByCategoryId.get(i.categoryId);
        if (name) map.set(i.id, name);
      }
    }
    return map;
  }

  /** Primary supplier name per itemId. */
  private async loadSuppliers(
    lines: InvoiceItemEntity[],
    organizationId: string,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
    if (!itemIds.length) return map;
    const links = await this.itemProviders.find({
      where: { itemId: In(itemIds), organizationId, isPrimary: true },
    });
    const providerIds = [...new Set(links.map((l) => l.providerId))];
    if (!providerIds.length) return map;
    const providers = await this.providers.find({
      where: { id: In(providerIds), organizationId },
    });
    const nameByProviderId = new Map(providers.map((p) => [p.id, p.name]));
    for (const l of links) {
      const name = nameByProviderId.get(l.providerId);
      if (name) map.set(l.itemId, name);
    }
    return map;
  }

  /** Location code + name per locationId (line items reference locations.id). */
  private async loadLocations(
    lines: InvoiceItemEntity[],
    organizationId: string,
  ): Promise<Map<string, { code: string | null; name: string | null }>> {
    const ids = [
      ...new Set(lines.map((l) => l.locationId).filter((id): id is string => !!id)),
    ];
    const map = new Map<string, { code: string | null; name: string | null }>();
    if (!ids.length) return map;
    const rows = await this.locations.find({ where: { id: In(ids), organizationId } });
    for (const loc of rows) map.set(loc.id, { code: loc.code, name: loc.name });
    return map;
  }
}
