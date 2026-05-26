import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  PartnerLookupType,
  QueryPartnerLookupDto,
} from './dto/query-partner-lookup.dto';
import {
  CustomerDebtStatus,
  QueryCustomerDebtsDto,
} from './dto/query-customer-debts.dto';
import { QueryCustomersWithDebtDto } from './dto/query-customers-with-debt.dto';

const DEFAULT_PAGE_SIZE = 20;

export interface PartnerLookupItem {
  type: 'employee' | 'customer' | 'supplier';
  id: string;
  name: string;
  code: string | null;
  address: string | null;
}

export interface PartnerLookupResult {
  data: PartnerLookupItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerDebtItem {
  id: string;
  referenceCode: string;
  invoiceId: string;
  documentType: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  issuedAt: string;
  dueDate: string | null;
  settledAt: Date | null;
  status: string;
  note: string | null;
}

export interface CustomerDebtsResult {
  data: CustomerDebtItem[];
  totalRemaining: number;
  totalOriginal: number;
  count: number;
}

export interface CustomerWithDebtItem {
  customerId: string;
  customerName: string;
  customerCode: string | null;
  debtCount: number;
  totalOriginal: number;
  totalRemaining: number;
  earliestDueDate: string | null;
  hasOverdue: boolean;
}

export interface CustomersWithDebtResult {
  data: CustomerWithDebtItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Read-only lookups for the cash-voucher form: a unified party picker
 * (customers / suppliers / employees) and a customer's outstanding debt
 * invoices. Queries the foreign tables via parameterized raw SQL — matching
 * PartnerResolverService — so the cash-vouchers module stays decoupled from the
 * customer / inventory / pos entity classes. `$1` is always the organization id
 * and `$2` the (escaped) search pattern, reused across the UNION branches.
 */
@Injectable()
export class PartnerLookupService {
  constructor(private readonly dataSource: DataSource) {}

  private readonly CUSTOMER_SELECT = `
    SELECT 'customer'::text AS type, c.id, c.name, c.code, c.address
    FROM customers c
    WHERE c.organization_id = $1
      AND c.status <> 'MERGED'
      AND ($2::text IS NULL OR c.name ILIKE $2 OR c.code ILIKE $2)`;

  private readonly SUPPLIER_SELECT = `
    SELECT 'supplier'::text AS type, p.id, p.name, p.code, p.notes AS address
    FROM inventory_providers p
    WHERE p.organization_id = $1
      AND p.is_active = true
      AND ($2::text IS NULL OR p.name ILIKE $2 OR p.code ILIKE $2)`;

  private readonly EMPLOYEE_SELECT = `
    SELECT 'employee'::text AS type, u.id,
      btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS name,
      ep.code, NULL::text AS address
    FROM users u
    LEFT JOIN employee_profiles ep
      ON ep.user_id = u.id AND ep.organization_id = $1
    WHERE u.organization_id = $1
      AND u.is_active = true
      AND ($2::text IS NULL
        OR btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) ILIKE $2
        OR ep.code ILIKE $2)`;

  async lookup(
    query: QueryPartnerLookupDto,
    actor: ActorContext,
  ): Promise<PartnerLookupResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const searchPattern = this.buildSearchPattern(query.search);

    const body = this.selectFragments(query.type).join('\n    UNION ALL\n');

    const countSql = `SELECT COUNT(*)::int AS total FROM (${body}) parties`;
    const countRows = await this.dataSource.query(countSql, [
      actor.organizationId,
      searchPattern,
    ]);
    const total = Number(countRows[0]?.total ?? 0);

    const pageSql = `SELECT * FROM (${body}) parties
      ORDER BY name ASC, id ASC
      LIMIT $3 OFFSET $4`;
    const rows = await this.dataSource.query(pageSql, [
      actor.organizationId,
      searchPattern,
      pageSize,
      offset,
    ]);

    const data: PartnerLookupItem[] = rows.map((r: any) => ({
      type: r.type,
      id: r.id,
      name: r.name ?? '',
      code: r.code ?? null,
      address: r.address ?? null,
    }));

    return { data, total, page, pageSize };
  }

  async customerDebts(
    query: QueryCustomerDebtsDto,
    actor: ActorContext,
  ): Promise<CustomerDebtsResult> {
    const status = query.status ?? CustomerDebtStatus.OPEN;

    const sql = `SELECT id, reference_code, invoice_id, document_type,
        original_amount, paid_amount, remaining_amount,
        issued_at, due_date, settled_at, status, note
      FROM invoice_debts
      WHERE organization_id = $1 AND customer_id = $2 AND status = $3
      ORDER BY issued_at DESC, id DESC`;
    const rows = await this.dataSource.query(sql, [
      actor.organizationId,
      query.customerId,
      status,
    ]);

    const data: CustomerDebtItem[] = rows.map((r: any) => ({
      id: r.id,
      referenceCode: r.reference_code,
      invoiceId: r.invoice_id,
      documentType: r.document_type,
      originalAmount: Number(r.original_amount),
      paidAmount: Number(r.paid_amount),
      remainingAmount: Number(r.remaining_amount),
      issuedAt: r.issued_at,
      dueDate: r.due_date ?? null,
      settledAt: r.settled_at ?? null,
      status: r.status,
      note: r.note ?? null,
    }));

    // In-memory aggregation over the fetched rows (bounded per customer).
    const totalRemaining = data.reduce((s, d) => s + d.remainingAmount, 0);
    const totalOriginal = data.reduce((s, d) => s + d.originalAmount, 0);

    return { data, totalRemaining, totalOriginal, count: data.length };
  }

  /**
   * List customers that currently have outstanding debt (remaining_amount > 0),
   * with a per-customer rollup. Fetches the open debt rows joined to their
   * customer, then groups/aggregates in memory (no SQL GROUP BY) and paginates
   * the resulting customer list.
   */
  async customersWithDebt(
    query: QueryCustomersWithDebtDto,
    actor: ActorContext,
  ): Promise<CustomersWithDebtResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const searchPattern = this.buildSearchPattern(query.search);

    const sql = `SELECT d.customer_id, d.original_amount, d.remaining_amount,
        d.due_date, d.status, c.name AS customer_name, c.code AS customer_code
      FROM invoice_debts d
      JOIN customers c
        ON c.id = d.customer_id AND c.organization_id = $1
      WHERE d.organization_id = $1
        AND d.remaining_amount > 0
        AND c.status <> 'MERGED'
        AND ($2::text IS NULL OR c.name ILIKE $2 OR c.code ILIKE $2)`;
    const rows: Array<{
      customer_id: string;
      original_amount: string;
      remaining_amount: string;
      due_date: string | null;
      status: string;
      customer_name: string | null;
      customer_code: string | null;
    }> = await this.dataSource.query(sql, [actor.organizationId, searchPattern]);

    // Group + aggregate per customer in memory.
    const byCustomer = new Map<string, CustomerWithDebtItem>();
    for (const r of rows) {
      let acc = byCustomer.get(r.customer_id);
      if (!acc) {
        acc = {
          customerId: r.customer_id,
          customerName: r.customer_name ?? '',
          customerCode: r.customer_code ?? null,
          debtCount: 0,
          totalOriginal: 0,
          totalRemaining: 0,
          earliestDueDate: null,
          hasOverdue: false,
        };
        byCustomer.set(r.customer_id, acc);
      }
      acc.debtCount += 1;
      acc.totalOriginal += Number(r.original_amount);
      acc.totalRemaining += Number(r.remaining_amount);
      if (r.status === CustomerDebtStatus.OVERDUE) acc.hasOverdue = true;
      if (r.due_date && (!acc.earliestDueDate || r.due_date < acc.earliestDueDate)) {
        acc.earliestDueDate = r.due_date;
      }
    }

    // Biggest debtors first, then by name for a stable order.
    const all = Array.from(byCustomer.values()).sort(
      (a, b) =>
        b.totalRemaining - a.totalRemaining ||
        a.customerName.localeCompare(b.customerName),
    );

    const offset = (page - 1) * pageSize;
    const data = all.slice(offset, offset + pageSize);

    return { data, total: all.length, page, pageSize };
  }

  /** SELECT fragments to UNION for a given lookup type. */
  private selectFragments(type: PartnerLookupType): string[] {
    switch (type) {
      case PartnerLookupType.CUSTOMER:
        return [this.CUSTOMER_SELECT];
      case PartnerLookupType.SUPPLIER:
        return [this.SUPPLIER_SELECT];
      case PartnerLookupType.EMPLOYEE:
        return [this.EMPLOYEE_SELECT];
      case PartnerLookupType.ALL:
      default:
        return [
          this.CUSTOMER_SELECT,
          this.SUPPLIER_SELECT,
          this.EMPLOYEE_SELECT,
        ];
    }
  }

  /**
   * Build an ILIKE pattern, escaping the `\ % _` wildcards so user input is
   * matched literally. Returns null when there is no search term so the
   * `$2 IS NULL` guard short-circuits to "match everything".
   */
  private buildSearchPattern(search?: string): string | null {
    const term = search?.trim();
    if (!term) return null;
    const escaped = term.replace(/[\\%_]/g, (c) => '\\' + c);
    return `%${escaped}%`;
  }
}
