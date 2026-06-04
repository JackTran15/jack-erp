export interface InventoryFormLine {
  itemId: string;
}

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
