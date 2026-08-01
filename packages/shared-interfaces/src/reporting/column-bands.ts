import { DocumentColumn } from './document-payload';

/**
 * One cell of the band row above the column labels.
 *
 * `label` is null for a column that belongs to no band — such a column occupies
 * both header rows rather than sitting under an empty cell.
 */
export interface ColumnBand {
  label: string | null;
  /** Index of the first column in this band, into the `columns` array. */
  start: number;
  /** How many columns the band covers; always at least 1. */
  span: number;
}

/**
 * Groups columns into the segments a two-tier header is built from.
 *
 * Both renderers read this rather than each grouping for itself: the exported
 * file and the printed page are the same document (ADR-01), and two copies of
 * "which columns belong together" is two chances to disagree.
 *
 * Only *adjacent* columns merge. Two runs carrying the same band label with
 * something else between them stay two bands — merging across the gap would
 * claim the column in the middle belongs to a band it does not.
 *
 * `Σ span` always equals `columns.length`, so a caller can walk the bands and
 * the columns in step.
 */
export function buildColumnBands(columns: DocumentColumn[]): ColumnBand[] {
  const bands: ColumnBand[] = [];

  columns.forEach((column, index) => {
    const label = column.group ?? null;
    const previous = bands[bands.length - 1];

    if (label !== null && previous && previous.label === label) {
      previous.span += 1;
      return;
    }

    bands.push({ label, start: index, span: 1 });
  });

  return bands;
}

/** True when any column carries a band — i.e. the header needs a second row. */
export function hasColumnBands(columns: DocumentColumn[]): boolean {
  return columns.some((column) => Boolean(column.group));
}
