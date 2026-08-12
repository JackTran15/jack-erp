import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * One-off remediation for the double-cancel race condition in
 * GoodsReceiptService.cancel() (fixed in the same change that added this
 * script — see goods-receipt.service.ts). Before the fix, cancelling a
 * POSTED goods receipt could run twice concurrently for the same receipt
 * (the row wasn't locked and status only flipped to CANCELLED after the
 * ledger write + a Kafka publish network call), each run posting its own
 * ADJUSTMENT_DECREASE reversal batch — so some (item, location) lines had
 * their stock wrongly subtracted 2-3x instead of once, driving
 * stock_balances.quantity negative.
 *
 * This script finds every (organization, reference_id=goods_receipt,
 * item, location) group with duplicate ADJUSTMENT_DECREASE reversal rows,
 * and posts ONE compensating ADJUSTMENT_INCREASE ledger entry per group for
 * the excess — per project convention, corrections are new reversal entries,
 * never edits/deletes of the immutable ledger.
 *
 * Safe to re-run: each correction is tagged reference_type='DATA_CORRECTION'
 * so a re-run skips any (reference_id, item, location) already corrected.
 *
 * Usage:
 *   ts-node src/scripts/fix-double-cancelled-goods-receipts.ts
 *     --> dry run: prints the correction plan, writes nothing.
 *
 *   ts-node src/scripts/fix-double-cancelled-goods-receipts.ts --apply --actor-user-id=<uuid>
 *     --> applies the plan inside one transaction. --actor-user-id is the
 *         operator running the fix; it's stamped as created_by on every
 *         correction row for audit purposes.
 *
 *   ... --reference-id=<goods_receipt_uuid>   optional: scope to one receipt
 *       (defaults to scanning every affected receipt in the database).
 */

interface DuplicateGroup {
  organization_id: string;
  branch_id: string;
  reference_id: string;
  document_number: string | null;
  item_id: string;
  location_id: string;
  reversal_count: string;
  quantity_per_reversal: string;
  unit_cost_per_reversal: string | null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const actorUserId = process.argv
    .find((a) => a.startsWith('--actor-user-id='))
    ?.split('=')[1];
  const referenceIdFilter = process.argv
    .find((a) => a.startsWith('--reference-id='))
    ?.split('=')[1];

  if (apply && !actorUserId) {
    console.error(
      'Refusing to --apply without --actor-user-id=<uuid> (stamped as created_by for audit).',
    );
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    database: process.env.DB_NAME || 'erp_dev',
    username: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASS || 'erp_secret',
    synchronize: false,
  });

  await dataSource.initialize();
  console.log(
    `Connected: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5433'}/${process.env.DB_NAME || 'erp_dev'} (${apply ? 'APPLY' : 'DRY RUN'})`,
  );

  try {
    const groups = await findDuplicateReversalGroups(
      dataSource,
      referenceIdFilter,
    );
    if (groups.length === 0) {
      console.log('No duplicate-cancel reversal groups found. Nothing to do.');
      return;
    }

    console.log(
      `Found ${groups.length} (item, location) line(s) affected across ${new Set(groups.map((g) => g.reference_id)).size} receipt(s):\n`,
    );

    let totalExcessQty = 0;
    const plan = groups.map((g) => {
      const count = Number(g.reversal_count);
      const perReversal = Math.abs(Number(g.quantity_per_reversal));
      const excessQty = perReversal * (count - 1);
      totalExcessQty += excessQty;
      return { ...g, count, perReversal, excessQty };
    });

    for (const p of plan) {
      console.log(
        `  receipt=${p.document_number ?? p.reference_id}  item=${p.item_id}  location=${p.location_id}  ` +
          `reversed_${p.count}x_of_${p.perReversal}  -> +${p.excessQty} bù lại`,
      );
    }
    console.log(`\nTotal excess quantity to restore: ${totalExcessQty}`);

    if (!apply) {
      console.log(
        '\nDry run only — no writes made. Re-run with --apply --actor-user-id=<uuid> to commit.',
      );
      return;
    }

    let corrected = 0;
    let skipped = 0;
    await dataSource.transaction(async (manager) => {
      for (const p of plan) {
        const already = await manager.query(
          `SELECT 1 FROM stock_ledger_entries
           WHERE reference_type = 'DATA_CORRECTION'
             AND reference_id = $1
             AND item_id = $2
             AND location_id = $3
           LIMIT 1`,
          [p.reference_id, p.item_id, p.location_id],
        );
        if (already.length > 0) {
          skipped++;
          continue;
        }

        const unitCost = p.unit_cost_per_reversal
          ? Number(p.unit_cost_per_reversal)
          : null;
        const lineValue = unitCost !== null ? p.excessQty * unitCost : null;

        await manager.query(
          `INSERT INTO stock_ledger_entries
             (id, organization_id, branch_id, item_id, location_id, movement_type,
              quantity, reference_type, reference_id, notes, posted_at,
              created_by, unit_cost, line_value)
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4, 'ADJUSTMENT_INCREASE',
              $5, 'DATA_CORRECTION', $6, $7, now(),
              $8, $9, $10)`,
          [
            p.organization_id,
            p.branch_id,
            p.item_id,
            p.location_id,
            p.excessQty,
            p.reference_id,
            `Bù trừ lỗi ghi trùng ${p.count} lần bút toán huỷ phiếu nhập kho ` +
              `${p.document_number ?? p.reference_id} (race condition khi huỷ, đã fix code)`,
            actorUserId,
            unitCost,
            lineValue,
          ],
        );

        await manager.query(
          `INSERT INTO stock_balances
             (id, organization_id, branch_id, item_id, location_id, quantity,
              last_movement_at, is_tracked, created_by)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now(), true, $6)
           ON CONFLICT (organization_id, item_id, location_id)
           DO UPDATE SET
             quantity = stock_balances.quantity + EXCLUDED.quantity,
             last_movement_at = now()`,
          [
            p.organization_id,
            p.branch_id,
            p.item_id,
            p.location_id,
            p.excessQty,
            actorUserId,
          ],
        );
        corrected++;
      }
    });

    console.log(
      `\nApplied: ${corrected} correction(s) written, ${skipped} already-corrected group(s) skipped.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

async function findDuplicateReversalGroups(
  dataSource: DataSource,
  referenceIdFilter?: string,
): Promise<DuplicateGroup[]> {
  return dataSource.query(
    `
      SELECT
        sle.organization_id,
        gr.branch_id,
        sle.reference_id,
        gr.document_number,
        sle.item_id,
        sle.location_id,
        COUNT(*) AS reversal_count,
        MIN(sle.quantity) AS quantity_per_reversal,
        MIN(sle.unit_cost) AS unit_cost_per_reversal
      FROM stock_ledger_entries sle
      INNER JOIN goods_receipts gr ON gr.id = sle.reference_id
      WHERE sle.reference_type = 'GOODS_RECEIPT'
        AND sle.movement_type = 'ADJUSTMENT_DECREASE'
        AND ($1::uuid IS NULL OR sle.reference_id = $1::uuid)
      GROUP BY sle.organization_id, gr.branch_id, sle.reference_id,
               gr.document_number, sle.item_id, sle.location_id
      -- duplicate-cancel signature: more than one reversal for the same
      -- line, all for an identical quantity (a real distinct movement would
      -- not coincidentally repeat the exact same negative quantity).
      HAVING COUNT(*) > 1 AND MAX(sle.quantity) = MIN(sle.quantity)
      ORDER BY gr.document_number, sle.item_id
    `,
    [referenceIdFilter ?? null],
  );
}

main().catch((err) => {
  console.error('Remediation failed:', err);
  process.exit(1);
});
