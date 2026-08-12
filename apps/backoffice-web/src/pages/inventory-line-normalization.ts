export interface InventoryFormLine {
  itemId: string;
}

/**
 * Client-only row identity for document line grids. Rows keyed by array index
 * remount everything below an insert/delete (losing focus and in-cell dropdown
 * state), and a virtualized grid would recycle a row's state onto a different
 * line entirely.
 *
 * A module counter beats randomUUID here — keys only need to be unique within
 * one list, and a 2000-line document would pay real entropy cost for nothing.
 *
 * Never include this in a save payload: it is not a server id.
 */
export interface KeyedFormLine {
  lineId: string;
}

let lineSeq = 0;

export const nextLineId = () => `ln${(lineSeq += 1)}`;

export const getLineKey = (line: KeyedFormLine) => line.lineId;

export const isFilledLine = <TLine extends InventoryFormLine>(line: TLine) =>
  Boolean(line.itemId);

export const getPersistableLines = <TLine extends InventoryFormLine>(
  nextLines: TLine[],
) => nextLines.filter(isFilledLine);

export const ensureTrailingBlankLine = <TLine extends InventoryFormLine>(
  nextLines: TLine[],
  createEmptyLine: () => TLine,
) => {
  const withoutExtraTrailingBlanks = nextLines.filter((line, index) => {
    if (isFilledLine(line)) return true;
    return index === nextLines.length - 1;
  });

  if (withoutExtraTrailingBlanks.length === 0) return [createEmptyLine()];

  const last = withoutExtraTrailingBlanks[withoutExtraTrailingBlanks.length - 1];
  return isFilledLine(last)
    ? [...withoutExtraTrailingBlanks, createEmptyLine()]
    : withoutExtraTrailingBlanks;
};
