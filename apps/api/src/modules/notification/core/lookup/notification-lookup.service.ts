import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { asUuid } from '../notification.types';

/**
 * Shared read helpers for definitions — display names and small document
 * reads. Raw SQL on purpose: the notification module must not import the
 * business modules it reports on (they do not know it exists either).
 */
@Injectable()
export class NotificationLookupService {
  constructor(private readonly dataSource: DataSource) {}

  /** "First Last" of a user; `null` when unknown or not a uuid (e.g. `system`). */
  async userName(userId: string | undefined): Promise<string | null> {
    const id = asUuid(userId);
    if (!id) return null;
    const rows: Array<{ name: string }> = await this.dataSource.query(
      `SELECT TRIM(CONCAT("first_name", ' ', "last_name")) AS name FROM "users" WHERE "id" = $1`,
      [id],
    );
    return rows[0]?.name || null;
  }

  async branchName(branchId: string | undefined): Promise<string | null> {
    const id = asUuid(branchId);
    if (!id) return null;
    const rows: Array<{ name: string }> = await this.dataSource.query(
      `SELECT "name" FROM "branches" WHERE "id"::text = $1`,
      [id],
    );
    return rows[0]?.name ?? null;
  }

  /** Amount columns of an invoice (payloads of RETURN_POSTED / INVOICE_CANCELLED carry none). */
  async invoiceAmounts(invoiceId: string | undefined): Promise<{
    code: string;
    type: string;
    amountDue: number;
    refundedAmount: number;
    netAmount: number;
    branchId: string | null;
  } | null> {
    const id = asUuid(invoiceId);
    if (!id) return null;
    const rows: Array<Record<string, string | null>> = await this.dataSource.query(
      `SELECT "code", "type", "amount_due", "refunded_amount", "net_amount", "branch_id"
         FROM "invoices" WHERE "id"::text = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      code: row.code ?? '',
      type: row.type ?? '',
      amountDue: Number(row.amount_due ?? 0),
      refundedAmount: Number(row.refunded_amount ?? 0),
      netAmount: Number(row.net_amount ?? 0),
      branchId: row.branch_id,
    };
  }
}
