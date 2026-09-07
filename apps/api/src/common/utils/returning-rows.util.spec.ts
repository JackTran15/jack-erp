import { affectedRowCount, returnedRows } from './returning-rows.util';

/**
 * The four shapes below are not invented — they are what TypeORM 0.3.28 returns
 * against a live Postgres, measured in
 * `test/e2e/typeorm-returning-shape.e2e-spec.ts`. This spec locks the parsing;
 * that one locks the premise. Keep the two in step: if the driver ever changes,
 * the e2e goes red first and this file follows.
 */
describe('returning-rows.util', () => {
  const selectTwoRows = [{ id: 'a' }, { id: 'b' }];
  const insertOneRow = [{ id: 'a' }];
  const updateMatchedNone: [unknown[], number] = [[], 0];
  const updateMatchedThree: [unknown[], number] = [
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    3,
  ];

  describe('returnedRows', () => {
    it('returns the rows of a SELECT unchanged', () => {
      expect(returnedRows(selectTwoRows)).toEqual(selectTwoRows);
    });

    it('returns the rows of an INSERT … RETURNING unchanged', () => {
      expect(returnedRows(insertOneRow)).toEqual(insertOneRow);
    });

    it('unwraps an UPDATE that matched no rows', () => {
      expect(returnedRows(updateMatchedNone)).toEqual([]);
    });

    it('unwraps an UPDATE that matched rows', () => {
      expect(returnedRows(updateMatchedThree)).toHaveLength(3);
    });

    it('treats a null/undefined result as no rows', () => {
      expect(returnedRows(null)).toEqual([]);
      expect(returnedRows(undefined)).toEqual([]);
    });
  });

  describe('affectedRowCount', () => {
    it('is 0 for an UPDATE that matched nothing — the case a raw .length gets wrong', () => {
      // The whole point: `updateMatchedNone.length` is 2.
      expect(updateMatchedNone.length).toBe(2);
      expect(affectedRowCount(updateMatchedNone)).toBe(0);
    });

    it('is the driver rowCount for an UPDATE that matched rows', () => {
      expect(affectedRowCount(updateMatchedThree)).toBe(3);
    });

    it('counts the rows of a SELECT or INSERT result', () => {
      expect(affectedRowCount(selectTwoRows)).toBe(2);
      expect(affectedRowCount(insertOneRow)).toBe(1);
    });

    it('does not mistake a two-row SELECT for the [rows, rowCount] wrapper', () => {
      // Both have length 2; only the wrapper has an array as its first element.
      expect(affectedRowCount(selectTwoRows)).toBe(2);
      expect(returnedRows(selectTwoRows)).toEqual(selectTwoRows);
    });

    it('is 0 for a null/undefined result', () => {
      expect(affectedRowCount(null)).toBe(0);
      expect(affectedRowCount(undefined)).toBe(0);
    });
  });
});
