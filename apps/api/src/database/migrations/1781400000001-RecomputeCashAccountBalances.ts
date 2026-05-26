import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recompute every cash_accounts.balance from its cash_movements, using the same
 * signed logic as the cash ledger (DEPOSIT/ADJUSTMENT +, WITHDRAWAL −, TRANSFER
 * − on the source / + on the destination). Corrects balances left stale by the
 * pre-fix POS cash-sale bug. Accounts with no movements reset to 0.
 *
 * NOTE: previously-failed POS cash sales sit in the dead-letter queue
 * (CASH_MOVEMENT_FROM_PAYMENT). Replaying them re-records their movements and
 * increments the balance incrementally, so this recompute is consistent whether
 * it runs before or after replay.
 */
export class RecomputeCashAccountBalances1781400000001
  implements MigrationInterface
{
  name = 'RecomputeCashAccountBalances1781400000001';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      UPDATE cash_accounts ca
      SET balance = COALESCE(sub.bal, 0),
          updated_at = now()
      FROM (
        SELECT acc.id AS cash_account_id,
               SUM(
                 CASE
                   WHEN m.type = 'DEPOSIT'    AND m.cash_account_id = acc.id THEN  m.amount
                   WHEN m.type = 'ADJUSTMENT' AND m.cash_account_id = acc.id THEN  m.amount
                   WHEN m.type = 'WITHDRAWAL' AND m.cash_account_id = acc.id THEN -m.amount
                   WHEN m.type = 'TRANSFER'   AND m.cash_account_id = acc.id THEN -m.amount
                   WHEN m.type = 'TRANSFER'   AND m.to_account_id   = acc.id THEN  m.amount
                   ELSE 0
                 END
               ) AS bal
        FROM cash_accounts acc
        LEFT JOIN cash_movements m
          ON (m.cash_account_id = acc.id OR m.to_account_id = acc.id)
        GROUP BY acc.id
      ) sub
      WHERE ca.id = sub.cash_account_id
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: balance is a derived running total.
  }
}
