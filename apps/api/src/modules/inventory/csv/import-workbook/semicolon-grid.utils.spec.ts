import {
  normalizeImportSheetGrid,
  parseSemicolonDelimitedGrid,
  trimTrailingEmptyColumns,
} from './semicolon-grid.utils';

describe('semicolon-grid.utils', () => {
  it('parses quoted semicolon fields', () => {
    const grid = parseSemicolonDelimitedGrid('A;"B;C";D\n1;2;3');
    expect(grid).toEqual([
      ['A', 'B;C', 'D'],
      ['1', '2', '3'],
    ]);
  });

  it('trims trailing empty columns', () => {
    const grid = [
      ['STT', 'Nhóm', '', ''],
      ['1', 'A', '', ''],
    ];
    expect(trimTrailingEmptyColumns(grid)).toEqual([
      ['STT', 'Nhóm'],
      ['1', 'A'],
    ]);
  });

  it('normalizes grid with empty tail rows and columns', () => {
    const grid = [
      ['STT', 'X', '', ''],
      ['1', 'Y', '', ''],
      ['', '', '', ''],
    ];
    expect(normalizeImportSheetGrid(grid)).toEqual([
      ['STT', 'X'],
      ['1', 'Y'],
    ]);
  });
});
