/** Parse delimited text (quote-aware, UTF-8 BOM, newline inside quoted cells). */
export function parseDelimitedGrid(
  text: string,
  delimiter: ';' | ',' = ';',
): string[][] {
  const normalized = text.replace(/^\uFEFF/, '');

  const grid: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = normalized[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cur += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(cur);
      cur = '';
      continue;
    }

    if (ch === '\r') {
      continue;
    }

    if (ch === '\n') {
      row.push(cur);
      grid.push(row);
      row = [];
      cur = '';
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  grid.push(row);

  return trimTrailingEmptyRows(grid);
}

/** Parse semicolon-delimited text (quote-aware, UTF-8 BOM). */
export function parseSemicolonDelimitedGrid(text: string): string[][] {
  return parseDelimitedGrid(text, ';');
}

export function trimTrailingEmptyRows(grid: string[][]): string[][] {
  const result = [...grid];
  while (result.length > 0) {
    const last = result[result.length - 1] ?? [];
    if (last.some((c) => cellTrim(c).length > 0)) break;
    result.pop();
  }
  return result;
}

export function trimTrailingEmptyColumns(grid: string[][]): string[][] {
  if (grid.length === 0) return grid;

  let lastUsed = -1;
  for (const row of grid) {
    for (let c = row.length - 1; c >= 0; c--) {
      if (cellTrim(row[c]).length > 0) {
        lastUsed = Math.max(lastUsed, c);
        break;
      }
    }
  }

  if (lastUsed < 0) return [[]];

  return grid.map((row) => row.slice(0, lastUsed + 1));
}

export function normalizeImportSheetGrid(grid: string[][]): string[][] {
  return trimTrailingEmptyColumns(trimTrailingEmptyRows(grid));
}

export function getUsedColumnCount(grid: string[][]): number {
  const trimmed = normalizeImportSheetGrid(grid);
  if (trimmed.length === 0) return 0;
  return Math.max(0, ...trimmed.map((row) => row.length));
}

function cellTrim(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
