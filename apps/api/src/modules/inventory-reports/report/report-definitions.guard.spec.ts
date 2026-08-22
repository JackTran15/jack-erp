import * as fs from 'fs';
import * as path from 'path';

/**
 * The way this bug comes back.
 *
 * Every paged inventory report used to pull its whole result set into memory
 * (`pageSize: MAX_REPORT_ROWS`) so it could filter, total and page in JS — and
 * `assertUnderRowCap` was the guard that stopped that eating the process. On a
 * 74,515-row organisation it turned a request for 50 rows into a 400.
 *
 * The fix moved all four jobs into SQL. Nothing stops someone adding an eighth
 * report by copying the old shape, so this reads the directory rather than a
 * hard-coded list: a new file is in scope the moment it exists.
 */
const REPORTS_DIR = path.join(__dirname, 'reports');

/** Source with comments stripped — a mention in prose is not a use. */
function code(file: string): string {
  return fs
    .readFileSync(path.join(REPORTS_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const definitions = fs
  .readdirSync(REPORTS_DIR)
  .filter((f) => f.endsWith('.report.ts'));

describe('inventory report definitions', () => {
  it('finds the definitions to check', () => {
    // A glob that silently matches nothing would make every test below vacuous.
    expect(definitions.length).toBeGreaterThanOrEqual(7);
  });

  it.each(definitions)('%s does not enforce the row cap itself', (file) => {
    // The cap belongs to the export path, where ReportExportService applies it
    // through countRows(). A definition that asserts it inside buildData is
    // capping the paged read as well — the exact defect this feature removed.
    expect(code(file)).not.toMatch(/assertUnderRowCap\s*\(/);
  });

  it.each(definitions)('%s does not request the whole set as one page', (file) => {
    expect(code(file)).not.toMatch(/pageSize:\s*MAX_REPORT_ROWS/);
  });

  it.each(definitions)('%s pages through its engine, not in memory', (file) => {
    const src = code(file);
    // `transfer-summary` is exempt: its engine returns one row per branch, so
    // there is no page to push down and nothing that grows with the catalogue.
    if (file === 'transfer-summary.report.ts') return;
    expect(src).not.toMatch(/\bpaginateRows\s*\(/);
    expect(src).not.toMatch(/\bapplyColumnFilters\s*\(/);
  });

  it.each(definitions)('%s takes its row count from the engine', (file) => {
    if (file === 'transfer-summary.report.ts') return;
    // `total: rows.length` measures the array in hand, which after pushdown is
    // one page — it would report the page size as the result count.
    expect(code(file)).not.toMatch(/total:\s*rows\.length/);
  });
});
