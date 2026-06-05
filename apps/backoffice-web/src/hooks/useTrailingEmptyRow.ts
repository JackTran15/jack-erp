import { useEffect } from "react";

/**
 * Keeps an editable grid ending with exactly ONE blank trailing row.
 *
 * Unified rule (identical across inventory grid dialogs):
 * - The grid always ends with exactly one empty row.
 * - The moment the user starts filling that last blank row (it stops being
 *   "empty"), a fresh blank row is appended at the bottom — so the user can
 *   keep tab/entering new lines without clicking "Thêm dòng".
 * - Never accumulates multiple trailing blanks: appending a new blank makes
 *   the new last row empty, so the effect immediately stabilizes.
 *
 * Empty trailing rows are NOT meant to be submitted — callers filter rows
 * missing required fields on save (unchanged here).
 *
 * @param rows     current grid rows
 * @param setRows  state setter for the rows
 * @param opts.isEmpty   true when a row has not been started (e.g. `!row.itemId`)
 * @param opts.makeEmpty factory producing a fresh blank row
 */
export function useTrailingEmptyRow<T>(
  rows: T[],
  setRows: React.Dispatch<React.SetStateAction<T[]>>,
  opts: { isEmpty: (row: T) => boolean; makeEmpty: () => T },
): void {
  const { isEmpty, makeEmpty } = opts;

  useEffect(() => {
    const last = rows[rows.length - 1];
    if (rows.length === 0 || !isEmpty(last)) {
      setRows((prev) => [...prev, makeEmpty()]);
    }
    // `makeEmpty`/`isEmpty` are recreated per render by callers; keying only on
    // `rows` is intentional — appending changes `rows` and re-runs the effect,
    // which then finds an empty trailing row and stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
}
