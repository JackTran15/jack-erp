import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * Reconciles transfer orders whose export goods issue carries an item the order
 * itself does not.
 *
 * How the drift got there: editing a posted TRANSFER_OUT goods issue cascades
 * into `TransferOrderService.applyLegRevision` → `adjustRequestedQty`, which is
 * supposed to insert a `transfer_order_lines` row for an item added to the issue
 * after the order was created. That insert branch was unreachable between
 * 2026-08-24 and this feature (it read `.length` off a TypeORM UPDATE result,
 * which is always 2 — see `common/utils/returning-rows.util.ts`), so the order
 * was left permanently missing an item its own issue was carrying.
 *
 * The destination branch then cannot receive: the goods-receipt form mirrors the
 * *issue's* lines, while `confirmImport` validates against the *order's* lines,
 * and the mismatch surfaces as `400 Line item is not part of the transfer order`.
 *
 * Fixing the code stops new drift. This script repairs what already drifted.
 *
 * Scope, deliberately narrow (ADR-03): only orders that are still receivable —
 * no import receipt yet, and not cancelled. A cancelled order is dead (users
 * cancelled to work around this very bug and raised a replacement); an imported
 * one is closed at the destination and must not be rewritten from here.
 *
 * Quantity written is the total the export issue carries for that item (ADR-04):
 * the issue is what actually moved, the order is only the plan.
 *
 * Writes nothing but `transfer_order_lines`. No ledger entry, no stock balance,
 * no Kafka event — order lines are plan data, not bookkeeping.
 *
 * Run:
 *   pnpm --filter @erp/api reconcile:transfer-order-lines
 *       Dry run. Prints the plan, touches nothing.
 *
 *   pnpm --filter @erp/api reconcile:transfer-order-lines -- --apply --actor-user-id=<uuid>
 *       Applies the plan. The actor id is stamped as created_by on every row
 *       inserted, so script-made lines stay tellable from user-made ones.
 *
 *   ... --transfer-order=<document_number>   optional: scope to one order
 */

interface DriftRow {
  transfer_order_id: string;
  document_number: string | null;
  status: string;
  source_storage_id: string | null;
  organization_id: string;
  branch_id: string | null;
  import_goods_receipt_id: string | null;
  export_no: string | null;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  issued_qty: string;
}

type Decision =
  | { act: true }
  | { act: false; reason: 'đã huỷ' | 'đã có phiếu nhập' };

function decide(row: DriftRow): Decision {
  if (row.status === 'CANCELLED') return { act: false, reason: 'đã huỷ' };
  if (row.import_goods_receipt_id)
    return { act: false, reason: 'đã có phiếu nhập' };
  return { act: true };
}

/**
 * Items the export issue carries that the order has no line for, with the
 * quantity the issue actually sent. `sum` because one issue may carry the same
 * item on several lines at several prices; the order holds one line per item.
 */
async function findDrift(
  dataSource: DataSource,
  documentNumber?: string,
): Promise<DriftRow[]> {
  return dataSource.query(
    `
    SELECT t.id                        AS transfer_order_id,
           t.document_number,
           t.status,
           t.source_storage_id,
           t.organization_id,
           t.branch_id,
           t.import_goods_receipt_id,
           gi.document_number          AS export_no,
           x.item_id,
           i.code                      AS item_code,
           i.name                      AS item_name,
           (SELECT sum(gil.quantity)
              FROM goods_issue_lines gil
             WHERE gil.goods_issue_id = gi.id
               AND gil.item_id = x.item_id) AS issued_qty
      FROM transfer_orders t
      JOIN goods_issues gi ON gi.id = t.export_goods_issue_id
      CROSS JOIN LATERAL (
        SELECT gil.item_id
          FROM goods_issue_lines gil
         WHERE gil.goods_issue_id = gi.id
        EXCEPT
        SELECT tol.item_id
          FROM transfer_order_lines tol
         WHERE tol.transfer_order_id = t.id
      ) x
      LEFT JOIN items i ON i.id = x.item_id
     WHERE ($1::varchar IS NULL OR t.document_number = $1)
     ORDER BY t.document_number, i.code
    `,
    [documentNumber ?? null],
  );
}

function printPlan(rows: DriftRow[]): void {
  if (rows.length === 0) {
    console.log('Không có lệnh điều chuyển nào lệch dòng.');
    return;
  }

  console.log(
    `\n${'Lệnh'.padEnd(17)}${'Phiếu xuất'.padEnd(14)}${'Trạng thái'.padEnd(14)}` +
      `${'Mặt hàng'.padEnd(22)}${'SL bù'.padStart(8)}  Quyết định`,
  );
  console.log('-'.repeat(100));

  for (const row of rows) {
    const decision = decide(row);
    console.log(
      `${(row.document_number ?? '—').padEnd(17)}` +
        `${(row.export_no ?? '—').padEnd(14)}` +
        `${row.status.padEnd(14)}` +
        `${(row.item_code ?? row.item_id.slice(0, 8)).padEnd(22)}` +
        `${Number(row.issued_qty).toString().padStart(8)}  ` +
        `${decision.act ? 'SẼ BÙ' : `BỎ QUA (${decision.reason})`}`,
    );
  }

  const actionable = rows.filter((r) => decide(r).act);
  const orders = new Set(actionable.map((r) => r.transfer_order_id));
  console.log('-'.repeat(100));
  console.log(
    `${rows.length} dòng lệch trên ${new Set(rows.map((r) => r.transfer_order_id)).size} lệnh · ` +
      `sẽ bù ${actionable.length} dòng trên ${orders.size} lệnh · ` +
      `bỏ qua ${rows.length - actionable.length} dòng`,
  );
}

/**
 * The bin to receive from is resolved the way `TransferOrderService` resolves it
 * for lines created at order time (`resolveSourceLocation`): the location in the
 * order's source storage holding the most of that item. Null is a legitimate
 * answer — the item may have left the source branch entirely by now — and the
 * column is nullable, exactly as for a line the service itself inserts.
 */
async function resolveSourceLocation(
  dataSource: DataSource,
  itemId: string,
  storageId: string,
  organizationId: string,
): Promise<string | null> {
  const rows: Array<{ location_id: string }> = await dataSource.query(
    `SELECT sb.location_id
       FROM stock_balances sb
       JOIN locations loc ON loc.id = sb.location_id
      WHERE sb.item_id = $1
        AND loc.storage_id = $2
        AND sb.organization_id = $3
        AND sb.quantity > 0
      ORDER BY sb.quantity DESC
      LIMIT 1`,
    [itemId, storageId, organizationId],
  );
  return rows[0]?.location_id ?? null;
}

/**
 * Inserts the missing `transfer_order_lines` rows, one transaction per order so
 * a single bad order cannot take the batch down with it.
 *
 * Idempotence needs no marker column: the plan comes from an `EXCEPT` against
 * the very table being written, so a second run finds nothing left to do.
 */
async function applyPlan(
  dataSource: DataSource,
  rows: DriftRow[],
  actorUserId: string,
): Promise<void> {
  const actionable = rows.filter((r) => decide(r).act);
  if (actionable.length === 0) {
    console.log('\nKhông có gì để bù.');
    return;
  }

  const byOrder = new Map<string, DriftRow[]>();
  for (const row of actionable) {
    const list = byOrder.get(row.transfer_order_id) ?? [];
    list.push(row);
    byOrder.set(row.transfer_order_id, list);
  }

  let insertedRows = 0;
  let repairedOrders = 0;
  const failures: Array<{ documentNumber: string; message: string }> = [];

  for (const [orderId, orderRows] of byOrder) {
    const label = orderRows[0].document_number ?? orderId;
    try {
      await dataSource.transaction(async (manager) => {
        for (const row of orderRows) {
          const sourceLocationId = row.source_storage_id
            ? await resolveSourceLocation(
                dataSource,
                row.item_id,
                row.source_storage_id,
                row.organization_id,
              )
            : null;
          await manager.query(
            `INSERT INTO transfer_order_lines
               (organization_id, branch_id, transfer_order_id, item_id,
                requested_qty, source_storage_id, source_location_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              row.organization_id,
              row.branch_id,
              orderId,
              row.item_id,
              row.issued_qty,
              row.source_storage_id,
              sourceLocationId,
              actorUserId,
            ],
          );
          insertedRows += 1;
        }
      });
      repairedOrders += 1;
      console.log(`  ✓ ${label}: bù ${orderRows.length} dòng`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ documentNumber: label, message });
      console.error(`  ✗ ${label}: ${message}`);
    }
  }

  console.log(
    `\nĐã bù ${insertedRows} dòng trên ${repairedOrders} lệnh · ` +
      `bỏ qua ${rows.length - actionable.length} dòng ngoài phạm vi · ` +
      `${failures.length} lệnh lỗi`,
  );
  console.log(
    'Không ghi stock_ledger_entries, không đụng stock_balances, không phát sự kiện — ' +
      'transfer_order_lines là dữ liệu kế hoạch.',
  );
  if (failures.length > 0) process.exit(1);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const actorUserId = process.argv
    .find((a) => a.startsWith('--actor-user-id='))
    ?.split('=')[1];
  const documentNumber = process.argv
    .find((a) => a.startsWith('--transfer-order='))
    ?.split('=')[1];

  if (apply && !actorUserId) {
    console.error(
      'Refusing to --apply without --actor-user-id=<uuid> (stamped as created_by for audit).',
    );
    process.exit(1);
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5433', 10);
  const database = process.env.DB_NAME || 'erp_dev';

  const dataSource = new DataSource({
    type: 'postgres',
    host,
    port,
    database,
    username: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASS || 'erp_secret',
    synchronize: false,
  });

  await dataSource.initialize();
  // Printed first and loudly: this repo carries eight database copies, and a
  // repair run against the wrong one is silent until it is expensive.
  console.log(
    `Connected: ${host}:${port}/${database} (${apply ? 'APPLY' : 'DRY RUN'})`,
  );

  try {
    const rows = await findDrift(dataSource, documentNumber);
    printPlan(rows);

    if (!apply) {
      console.log(
        '\nDRY RUN — không ghi gì. Thêm --apply --actor-user-id=<uuid> để bù.',
      );
      return;
    }

    await applyPlan(dataSource, rows, actorUserId!);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
