import * as fs from 'fs';
import * as path from 'path';

/**
 * T-05-01 — the guard behind `employee-branch-scope.md`.
 *
 * Four employee pickers shipped organization-wide because nobody was counting
 * them. Counting them once fixes today; this test is what keeps the count true.
 * It fails when a query over `users` or `employee_profiles` appears in a file
 * the reference table does not name.
 *
 * It cannot tell a picker from a resolver — that judgement is the table's job.
 * What it can do is refuse to let a new one appear silently.
 */

const MODULES_DIR = path.join(__dirname, '..');
const TABLE_PATH = path.join(__dirname, 'employee-branch-scope.md');

/** A file is a candidate when it queries the people tables in any of these ways. */
const QUERY_MARKERS = [
  /InjectRepository\(UserEntity\)/,
  /InjectRepository\(EmployeeProfileEntity\)/,
  /FROM users\s/,
  /FROM employee_profiles\s/,
];

/**
 * Escape hatch, so the test is something to update rather than something to
 * delete. The reason must be long enough to be a reason.
 */
const EXEMPTION = /@employee-listing:\s*(.+)/;
const MIN_REASON_LENGTH = 20;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts'))
      out.push(full);
  }
  return out;
}

/** Repo-relative, forward-slashed, as the table writes them. */
const relative = (file: string) =>
  path.relative(MODULES_DIR, file).split(path.sep).join('/');

describe('employee-listing surfaces', () => {
  const table = fs.readFileSync(TABLE_PATH, 'utf8');
  const candidates = walk(MODULES_DIR).filter((file) => {
    const src = fs.readFileSync(file, 'utf8');
    return QUERY_MARKERS.some((re) => re.test(src));
  });

  it('finds the queries at all (the sweep is not silently matching nothing)', () => {
    expect(candidates.length).toBeGreaterThan(10);
  });

  it.each([
    'counterparty/queries/search-counterparties.handler.ts',
    'accounting/cash-vouchers/shared/partner-lookup.service.ts',
    'reporting/invoice-report/queries/get-report-filter-options.handler.ts',
  ])('still sweeps up the known picker %s', (rel) => {
    expect(candidates.map(relative)).toContain(rel);
  });

  /** Reason declared in the file itself, if any. */
  const exemptionOf = (file: string): string | undefined =>
    fs.readFileSync(file, 'utf8').match(EXEMPTION)?.[1]?.trim();

  it('names every file that queries users or employee_profiles', () => {
    const undocumented = candidates
      .filter((file) => exemptionOf(file) === undefined)
      .map(relative)
      .filter((rel) => !table.includes(rel));

    expect(undocumented).toEqual([]);
  });

  // The escape hatch has to be real, or the test becomes something people delete
  // instead of update — but a blank reason is just a quieter way of deleting it.
  it('rejects an in-file exemption whose reason is too short to be one', () => {
    const tooShort = candidates
      .map((file) => [relative(file), exemptionOf(file)] as const)
      .filter(
        ([, reason]) =>
          reason !== undefined && reason.length < MIN_REASON_LENGTH,
      );

    expect(tooShort).toEqual([]);
  });

  // The table is a promise about scope, so the three files this feature changed
  // must actually carry the scope service. Naming alone is not evidence.
  it.each([
    'counterparty/queries/search-counterparties.handler.ts',
    'accounting/cash-vouchers/shared/partner-lookup.service.ts',
    'reporting/invoice-report/queries/get-report-filter-options.handler.ts',
  ])('%s really applies the branch scope', (rel) => {
    const src = fs.readFileSync(path.join(MODULES_DIR, rel), 'utf8');
    expect(src).toContain('EmployeeBranchScopeService');
    expect(src).toMatch(/employeeBranchScopeSql(Named|Positional)/);
  });
});
