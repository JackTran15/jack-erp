import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every data table in the backoffice uses the shared row tokens (`--table-row-*`):
 * striped white/gray, blue hover, purple selected. A hand-written `<table>` opts in with
 * the `erp-data-table` class (index.css), or carries a `table-contrast: exempt — <reason>`
 * comment within the 3 lines above it when it is not a list of records.
 * (2026100101-customer-points-ui-fixes, AC-24)
 */

const SRC = join(__dirname, "..", "..");

/** Components that apply the tokens themselves through `--row-bg`, and paper print templates. */
const SKIP = [
  "components/table/BaseDataTable.tsx",
  "pages/chain-store/reports/ReportPageTable/ReportPageTableView/ReportPageTableView.tsx",
  "lib/print/",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Blank out comments (keeping newlines, so line numbers stay true). */
function stripComments(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p1: string) => p1 + blank(m.slice(p1.length)));
}

interface Finding {
  file: string;
  line: number;
}

function scan(): { missing: Finding[]; exempt: Finding[]; covered: number } {
  const missing: Finding[] = [];
  const exempt: Finding[] = [];
  let covered = 0;
  for (const path of sourceFiles(SRC)) {
    const file = relative(SRC, path);
    if (SKIP.some((s) => file.startsWith(s))) continue;
    const raw = readFileSync(path, "utf8");
    const code = stripComments(raw);
    const rawLines = raw.split("\n");
    for (const match of code.matchAll(/<table\b/g)) {
      const index = match.index ?? 0;
      const line = code.slice(0, index).split("\n").length;
      const openTag = code.slice(index, code.indexOf(">", index) + 1);
      if (openTag.includes("erp-data-table")) {
        covered += 1;
      } else if (rawLines.slice(Math.max(0, line - 4), line).some((l) => l.includes("table-contrast: exempt"))) {
        exempt.push({ file, line });
      } else {
        missing.push({ file, line });
      }
    }
  }
  return { missing, exempt, covered };
}

describe("table row contrast coverage", () => {
  it("every hand-written <table> uses .erp-data-table or is explicitly exempt", () => {
    const { missing, exempt, covered } = scan();
    console.info(
      `[table-contrast] ${covered} tables use .erp-data-table; exempt: ${
        exempt.map((e) => `${e.file}:${e.line}`).join(", ") || "none"
      }`,
    );
    expect(missing.map((m) => `${m.file}:${m.line}`)).toEqual([]);
    expect(covered).toBeGreaterThan(40);
  });

  it("detects a table without the class (self-check of the scanner)", () => {
    const code = stripComments('// <table className="x">\nconst a = <table className="plain">;\n/* <table> */');
    const hits = [...code.matchAll(/<table\b/g)];
    expect(hits).toHaveLength(1);
    expect(code.slice(hits[0].index ?? 0)).toContain('className="plain"');
  });
});
