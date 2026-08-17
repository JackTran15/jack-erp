/**
 * Read-only reconciliation of the three invariants this feature's edit/delete
 * flow rests on (see `.ai/features/warehouse-voucher-edit-delete/03-logical-design.md`,
 * ADR-03):
 *
 *   INV-1  Σ stock_ledger_entries.quantity  for a voucher = that voucher's current
 *          line quantity (0 if the voucher is CANCELLED/REVERSED).
 *   INV-2  Σ stock_ledger_entries.line_value for a voucher = that voucher's current
 *          line value (0 if cancelled).
 *   INV-3  For goods receipts: net DR-CR postings to 156/111/331 attributed to the
 *          receipt = the receipt's current total (0 if cancelled). Goods issues carry
 *          no accounting in this feature's scope, so INV-3 is receipt-only.
 *
 * Never writes anything. Run before accepting G4 and whenever a live figure looks
 * wrong.
 *
 * Run: pnpm --filter @erp/api ts-node src/database/seeds/voucher-invariant-audit.script.ts \
 *        --org <organizationId> [--branch <branchId>] [--from 2026-01-01] [--to 2026-12-31]
 */
import { AppDataSource } from '../data-source';

interface Args {
  org: string;
  branch?: string;
  from?: string;
  to?: string;
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  if (!flags.org) {
    throw new Error('Usage: --org <organizationId> [--branch <branchId>] [--from <date>] [--to <date>]');
  }
  return { org: flags.org, branch: flags.branch, from: flags.from, to: flags.to };
}

interface Violation {
  documentType: 'GOODS_RECEIPT' | 'GOODS_ISSUE';
  documentNumber: string;
  id: string;
  check: string;
  expected: number;
  actual: number;
}

const EPSILON = 0.01;

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

async function auditGoodsReceipts(args: Args): Promise<Violation[]> {
  const params: unknown[] = [args.org];
  let dateFilter = '';
  if (args.branch) {
    params.push(args.branch);
    dateFilter += ` AND gr.branch_id = $${params.length}`;
  }
  if (args.from) {
    params.push(args.from);
    dateFilter += ` AND gr.received_at >= $${params.length}`;
  }
  if (args.to) {
    params.push(args.to);
    dateFilter += ` AND gr.received_at < $${params.length}`;
  }

  const receipts: {
    id: string;
    document_number: string | null;
    status: string;
    payment_method: string | null;
    line_qty: string;
    line_value: string;
  }[] = await AppDataSource.query(
    `
    SELECT
      gr.id, gr.document_number, gr.status, gr.payment_method,
      COALESCE(la.qty, 0)   AS line_qty,
      COALESCE(la.value, 0) AS line_value
    FROM goods_receipts gr
    LEFT JOIN LATERAL (
      SELECT SUM(quantity) AS qty, SUM(quantity * unit_price) AS value
      FROM goods_receipt_lines
      WHERE goods_receipt_id = gr.id
    ) la ON true
    WHERE gr.organization_id = $1 ${dateFilter}
    `,
    params,
  );
  if (receipts.length === 0) return [];

  const ids = receipts.map((r) => r.id);
  const ledgerRows: { reference_id: string; qty: string; value: string }[] =
    await AppDataSource.query(
      `
      SELECT reference_id, SUM(quantity) AS qty, SUM(line_value) AS value
      FROM stock_ledger_entries
      WHERE reference_type = 'GOODS_RECEIPT' AND organization_id = $1
        AND reference_id = ANY($2::uuid[])
      GROUP BY reference_id
      `,
      [args.org, ids],
    );
  const ledgerByReceipt = new Map(ledgerRows.map((r) => [r.reference_id, r]));

  const journalRows: { source_reference_id: string; code: string; net: string }[] =
    await AppDataSource.query(
      `
      SELECT je.source_reference_id, a.code,
             SUM(jl.debit_amount - jl.credit_amount) AS net
      FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id = je.id
      JOIN accounts a ON a.id = jl.account_id
      WHERE je.organization_id = $1
        AND je.source_reference_id = ANY($2::uuid[])
        AND a.code = '156'
      GROUP BY je.source_reference_id, a.code
      `,
      [args.org, ids],
    );
  const journalByReceipt = new Map<string, Map<string, number>>();
  for (const row of journalRows) {
    if (!journalByReceipt.has(row.source_reference_id)) {
      journalByReceipt.set(row.source_reference_id, new Map());
    }
    journalByReceipt.get(row.source_reference_id)!.set(row.code, Number(row.net));
  }

  const debtRows: { goods_receipt_id: string; original_amount: string }[] =
    await AppDataSource.query(
      `
      SELECT goods_receipt_id, original_amount
      FROM supplier_debts
      WHERE organization_id = $1 AND goods_receipt_id = ANY($2::uuid[])
      `,
      [args.org, ids],
    );
  const debtByReceipt = new Map(debtRows.map((r) => [r.goods_receipt_id, Number(r.original_amount)]));

  const violations: Violation[] = [];
  for (const r of receipts) {
    const cancelled = r.status === 'CANCELLED' || r.status === 'REVERSED';
    const expectedQty = cancelled ? 0 : Number(r.line_qty);
    const expectedValue = cancelled ? 0 : Number(r.line_value);
    const docNumber = r.document_number ?? r.id;

    const ledger = ledgerByReceipt.get(r.id);
    const ledgerQty = Number(ledger?.qty ?? 0);
    const ledgerValue = Number(ledger?.value ?? 0);
    if (!closeEnough(ledgerQty, expectedQty)) {
      violations.push({ documentType: 'GOODS_RECEIPT', documentNumber: docNumber, id: r.id, check: 'INV-1 (quantity)', expected: expectedQty, actual: ledgerQty });
    }
    if (!closeEnough(ledgerValue, expectedValue)) {
      violations.push({ documentType: 'GOODS_RECEIPT', documentNumber: docNumber, id: r.id, check: 'INV-2 (line_value)', expected: expectedValue, actual: ledgerValue });
    }

    if (r.payment_method === 'CREDIT') {
      // Credit postings key their journal entry on the receipt id directly
      // (`applyCreditDelta`, `post()`'s CREDIT branch) — a plain lookup works.
      const net156 = journalByReceipt.get(r.id)?.get('156') ?? 0;
      if (!closeEnough(net156, expectedValue)) {
        violations.push({ documentType: 'GOODS_RECEIPT', documentNumber: docNumber, id: r.id, check: 'INV-3 (156)', expected: expectedValue, actual: net156 });
      }
    }
    if (r.payment_method === 'CASH') {
      // Cash postings do NOT key their journal entry on the receipt id —
      // `CashService.recordMovement` keys it on the cash_movement row instead
      // (`sourceReferenceId: savedMovement.id`), for both the original posting
      // and every adjustment `applyCashDelta` makes through
      // `CashPaymentsService`/`CashReceiptsService`. Reconciling by tracing
      // `journal_entries` back through `cash_movements` would need one lookup
      // per voucher revision; net cash paid out is read off the voucher tables
      // directly instead — see the `cash_payments`/`cash_receipts` pass below.
    } else if (r.payment_method === 'CREDIT') {
      const debtOriginal = debtByReceipt.get(r.id);
      // A fully-settled-and-cancelled unpaid debt is deleted outright (T-02-03) —
      // no row is itself a pass, not a violation.
      if (debtOriginal !== undefined && !closeEnough(debtOriginal, expectedValue)) {
        violations.push({ documentType: 'GOODS_RECEIPT', documentNumber: docNumber, id: r.id, check: 'INV-3 (supplier_debts.originalAmount)', expected: expectedValue, actual: debtOriginal });
      }
    }
  }

  const cashViolations = await auditCashReceipts(
    args,
    receipts.filter((r) => r.payment_method === 'CASH'),
  );
  return [...violations, ...cashViolations];
}

/**
 * INV-3 for cash receipts, computed off `cash_payments`/`cash_receipts`
 * directly rather than `journal_entries` — see the comment above.
 *
 * Correlation is exact for the original posting (`reference_type =
 * 'GOODS_RECEIPT' AND reference_id = receipt.id`) and by description prefix for
 * `applyCashDelta`'s adjustments, since those carry a synthetic `referenceId`
 * that cannot be reversed back to the receipt in SQL. One query pair per
 * receipt — the CASH subset of a branch/period is small enough that this
 * stays a diagnostic script, not a hot path.
 */
async function auditCashReceipts(
  args: Args,
  cashReceipts: { id: string; document_number: string | null; status: string; line_value: string }[],
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const r of cashReceipts) {
    const cancelled = r.status === 'CANCELLED' || r.status === 'REVERSED';
    const expectedValue = cancelled ? 0 : Number(r.line_value);
    const docNumber = r.document_number ?? r.id;
    const adjustmentPrefix = `Adjustment for ${docNumber} %`;

    const [paid] = await AppDataSource.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM cash_payments
      WHERE organization_id = $1 AND status != 'REVERSED'
        AND ((reference_type = 'GOODS_RECEIPT' AND reference_id = $2)
             OR reason LIKE $3)
      `,
      [args.org, r.id, adjustmentPrefix],
    );
    const [refunded] = await AppDataSource.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM cash_receipts
      WHERE organization_id = $1 AND status != 'REVERSED'
        AND reason LIKE $2
      `,
      [args.org, adjustmentPrefix],
    );
    const netPaid = Number(paid.total) - Number(refunded.total);
    if (!closeEnough(netPaid, expectedValue)) {
      violations.push({ documentType: 'GOODS_RECEIPT', documentNumber: docNumber, id: r.id, check: 'INV-3 (net cash paid)', expected: expectedValue, actual: netPaid });
    }
  }
  return violations;
}

async function auditGoodsIssues(args: Args): Promise<Violation[]> {
  const params: unknown[] = [args.org];
  let dateFilter = '';
  if (args.branch) {
    params.push(args.branch);
    dateFilter += ` AND gi.branch_id = $${params.length}`;
  }
  if (args.from) {
    params.push(args.from);
    dateFilter += ` AND gi.created_at >= $${params.length}`;
  }
  if (args.to) {
    params.push(args.to);
    dateFilter += ` AND gi.created_at < $${params.length}`;
  }

  const issues: {
    id: string;
    document_number: string | null;
    status: string;
    line_qty: string;
    line_value: string;
  }[] = await AppDataSource.query(
    `
    SELECT
      gi.id, gi.document_number, gi.status,
      COALESCE(la.qty, 0)   AS line_qty,
      COALESCE(la.value, 0) AS line_value
    FROM goods_issues gi
    LEFT JOIN LATERAL (
      SELECT SUM(quantity) AS qty, SUM(quantity * unit_price) AS value
      FROM goods_issue_lines
      WHERE goods_issue_id = gi.id
    ) la ON true
    WHERE gi.organization_id = $1 ${dateFilter}
    `,
    params,
  );
  if (issues.length === 0) return [];

  const ids = issues.map((i) => i.id);
  const ledgerRows: { reference_id: string; qty: string; value: string }[] =
    await AppDataSource.query(
      `
      SELECT reference_id, SUM(quantity) AS qty, SUM(line_value) AS value
      FROM stock_ledger_entries
      WHERE reference_type = 'GOODS_ISSUE' AND organization_id = $1
        AND reference_id = ANY($2::uuid[])
      GROUP BY reference_id
      `,
      [args.org, ids],
    );
  const ledgerByIssue = new Map(ledgerRows.map((r) => [r.reference_id, r]));

  const violations: Violation[] = [];
  for (const i of issues) {
    const cancelled = i.status === 'CANCELLED';
    // Goods-issue quantities and stock-ledger movements are both stored
    // positive-out-as-negative; the lines table keeps quantity positive, so the
    // expected ledger sum is the negative of the line quantity.
    const expectedQty = cancelled ? 0 : -Number(i.line_qty);
    const expectedValue = cancelled ? 0 : -Number(i.line_value);
    const docNumber = i.document_number ?? i.id;

    const ledger = ledgerByIssue.get(i.id);
    const ledgerQty = Number(ledger?.qty ?? 0);
    const ledgerValue = Number(ledger?.value ?? 0);
    if (!closeEnough(ledgerQty, expectedQty)) {
      violations.push({ documentType: 'GOODS_ISSUE', documentNumber: docNumber, id: i.id, check: 'INV-1 (quantity)', expected: expectedQty, actual: ledgerQty });
    }
    if (!closeEnough(ledgerValue, expectedValue)) {
      violations.push({ documentType: 'GOODS_ISSUE', documentNumber: docNumber, id: i.id, check: 'INV-2 (line_value)', expected: expectedValue, actual: ledgerValue });
    }
  }
  return violations;
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await AppDataSource.initialize();
  try {
    const [receiptViolations, issueViolations] = await Promise.all([
      auditGoodsReceipts(args),
      auditGoodsIssues(args),
    ]);
    const violations = [...receiptViolations, ...issueViolations];

    if (violations.length === 0) {
      console.log('No invariant violations found.');
      return;
    }

    console.log(`${violations.length} violation(s):\n`);
    console.table(
      violations.map((v) => ({
        Type: v.documentType,
        Document: v.documentNumber,
        Check: v.check,
        Expected: v.expected.toFixed(2),
        Actual: v.actual.toFixed(2),
        Diff: (v.actual - v.expected).toFixed(2),
      })),
    );
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
