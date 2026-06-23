import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
  StringOperator,
} from '../../../../common/filters/filter.dto';
import { CashVoucherSearchDto } from './cash-voucher-search.dto';
import { SearchCashVouchersQuery } from './search-cash-vouchers.query';

interface CountRow {
  total: number;
}

@QueryHandler(SearchCashVouchersQuery)
export class SearchCashVouchersHandler
  implements IQueryHandler<SearchCashVouchersQuery>
{
  constructor(private readonly dataSource: DataSource) {}

  async execute({ dto, actor }: SearchCashVouchersQuery) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;
    const params: unknown[] = [actor.organizationId];

    params.push(dto.cashAccountId ?? actor.branchId);
    const scopeColumn = dto.cashAccountId ? 'cash_account_id' : 'branch_id';
    const combinedCte = this.combinedCte(scopeColumn);
    const where: string[] = [];

    this.applyDateRange(where, params, '"voucherDate"', dto);
    this.applyString(where, params, '"documentNumber"', dto.documentNumber);
    this.applyEnum(where, params, '"documentType"', dto.documentType?.value);
    this.applyCompare(where, params, '"totalAmount"', dto.totalAmount);
    this.applyString(where, params, 'counterparty', dto.counterparty);
    this.applyString(where, params, 'reason', dto.reason);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const dataSql = `
      ${combinedCte}
      SELECT * FROM unified
      ${whereSql}
      ORDER BY "voucherDate" DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countSql = `
      ${combinedCte}
      SELECT COUNT(*)::int AS total FROM unified
      ${whereSql}
    `;

    const [data, countRows] = await Promise.all([
      this.dataSource.query(dataSql, [...params, limit, offset]),
      this.dataSource.query<CountRow[]>(countSql, params),
    ]);

    return { data, total: countRows[0]?.total ?? 0, page, limit };
  }

  private combinedCte(scopeColumn: 'cash_account_id' | 'branch_id'): string {
    const scope = `${scopeColumn} = $2`;
    return `
      WITH unified AS (
        SELECT
          'RECEIPT' AS kind,
          r.id,
          r.voucher_date AS "voucherDate",
          COALESCE(r.document_number, '') AS "documentNumber",
          'cash_receipt' AS "documentType",
          r.status::text AS status,
          r.total_amount::float AS "totalAmount",
          COALESCE(r.payer_name, r.partner_name_snapshot, '') AS counterparty,
          COALESCE(r.reason, '') AS reason,
          r.reference_type::text AS "referenceType",
          false AS "isGoodsReceiptPayment",
          (
            r.reference_type IS NOT NULL
            AND r.reference_type NOT IN ('MANUAL', 'REVERSAL')
          ) AS "isAutoVoucher",
          ${this.detailJson('r', 'cash_receipt_lines', 'cash_receipt_id', 'payerName')} AS receipt,
          NULL::jsonb AS payment
        FROM cash_receipts r
        WHERE r.organization_id = $1 AND r.${scope} AND r.deleted_at IS NULL

        UNION ALL

        SELECT
          'PAYMENT' AS kind,
          p.id,
          p.voucher_date AS "voucherDate",
          COALESCE(p.document_number, '') AS "documentNumber",
          CASE
            WHEN p.reference_type = 'GOODS_RECEIPT' THEN 'goods_receipt_payment'
            ELSE 'cash_payment'
          END AS "documentType",
          p.status::text AS status,
          p.total_amount::float AS "totalAmount",
          COALESCE(p.payee_name, p.partner_name_snapshot, '') AS counterparty,
          COALESCE(p.reason, '') AS reason,
          p.reference_type::text AS "referenceType",
          p.reference_type = 'GOODS_RECEIPT' AS "isGoodsReceiptPayment",
          (
            p.reference_type IS NOT NULL
            AND p.reference_type NOT IN ('MANUAL', 'REVERSAL')
          ) AS "isAutoVoucher",
          NULL::jsonb AS receipt,
          ${this.detailJson('p', 'cash_payment_lines', 'cash_payment_id', 'payeeName')} AS payment
        FROM cash_payments p
        WHERE p.organization_id = $1 AND p.${scope} AND p.deleted_at IS NULL
      )
    `;
  }

  private detailJson(
    alias: 'r' | 'p',
    lineTable: 'cash_receipt_lines' | 'cash_payment_lines',
    lineForeignKey: 'cash_receipt_id' | 'cash_payment_id',
    partyNameKey: 'payerName' | 'payeeName',
  ): string {
    const partyColumn = partyNameKey === 'payerName' ? 'payer_name' : 'payee_name';
    return `jsonb_build_object(
      'id', ${alias}.id,
      'organizationId', ${alias}.organization_id,
      'branchId', ${alias}.branch_id,
      'createdAt', ${alias}.created_at,
      'updatedAt', ${alias}.updated_at,
      'createdBy', ${alias}.created_by,
      'documentNumber', ${alias}.document_number,
      'voucherDate', ${alias}.voucher_date,
      'status', ${alias}.status,
      'purpose', ${alias}.purpose,
      'partnerType', ${alias}.partner_type,
      'partnerId', ${alias}.partner_id,
      'partnerNameSnapshot', ${alias}.partner_name_snapshot,
      'partnerAddressSnapshot', ${alias}.partner_address_snapshot,
      '${partyNameKey}', ${alias}.${partyColumn},
      'reason', ${alias}.reason,
      'staffId', ${alias}.staff_id,
      'referenceType', ${alias}.reference_type,
      'referenceId', ${alias}.reference_id,
      'cashAccountId', ${alias}.cash_account_id,
      'contraAccountId', ${alias}.contra_account_id,
      'totalAmount', ${alias}.total_amount::float,
      'attachmentIds', ${alias}.attachment_ids,
      'cashMovementId', ${alias}.cash_movement_id,
      'journalEntryId', ${alias}.journal_entry_id,
      'lines', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', l.id,
          'organizationId', l.organization_id,
          'branchId', l.branch_id,
          '${lineForeignKey === 'cash_receipt_id' ? 'cashReceiptId' : 'cashPaymentId'}', l.${lineForeignKey},
          'lineOrder', l.line_order,
          'description', l.description,
          'categoryId', l.category_id,
          'amount', l.amount::float,
          'referenceNote', l.reference_note
        ) ORDER BY l.line_order, l.id)
        FROM ${lineTable} l
        WHERE l.${lineForeignKey} = ${alias}.id
      ), '[]'::jsonb)
    )`;
  }

  private applyString(
    where: string[],
    params: unknown[],
    column: string,
    filter?: StringFilterDto,
  ): void {
    const value = filter?.value?.trim();
    if (!value) return;
    const target = `COALESCE(${column}, '')`;
    const escaped = value.replace(/[\\%_]/g, (char) => `\\${char}`);

    const patterns: Record<StringOperator, string> = {
      [StringOperator.CONTAINS]: `%${escaped}%`,
      [StringOperator.EQUALS]: value,
      [StringOperator.STARTS_WITH]: `${escaped}%`,
      [StringOperator.ENDS_WITH]: `%${escaped}`,
      [StringOperator.NOT_CONTAINS]: `%${escaped}%`,
    };
    params.push(patterns[filter!.operator]);
    const operator =
      filter!.operator === StringOperator.NOT_CONTAINS ? 'NOT ILIKE' : 'ILIKE';
    where.push(`${target} ${operator} $${params.length}`);
  }

  private applyCompare(
    where: string[],
    params: unknown[],
    column: string,
    filter?: CompareFilterDto,
  ): void {
    if (!filter || filter.value === undefined || filter.value === '') return;
    const value = Number(filter.value);
    if (!Number.isFinite(value)) return;
    params.push(value);
    where.push(`${column} ${COMPARE_SQL[filter.operator]} $${params.length}`);
  }

  private applyDateRange(
    where: string[],
    params: unknown[],
    column: string,
    dto: CashVoucherSearchDto,
  ): void {
    if (dto.voucherDate?.from) {
      params.push(dto.voucherDate.from);
      where.push(`${column} >= $${params.length}::date`);
    }
    if (dto.voucherDate?.to) {
      params.push(dto.voucherDate.to);
      where.push(`${column} < ($${params.length}::date + INTERVAL '1 day')`);
    }
  }

  private applyEnum(
    where: string[],
    params: unknown[],
    column: string,
    value?: string,
  ): void {
    if (!value) return;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  }
}

const COMPARE_SQL: Record<CompareOperator, string> = {
  [CompareOperator.EQUALS]: '=',
  [CompareOperator.LT]: '<',
  [CompareOperator.LTE]: '<=',
  [CompareOperator.GT]: '>',
  [CompareOperator.GTE]: '>=',
};
