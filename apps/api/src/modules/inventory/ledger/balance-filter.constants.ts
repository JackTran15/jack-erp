export const STRING_FILTER_MODES = [
  'contains',
  'equals',
  'startsWith',
  'endsWith',
  'notContains',
] as const;
export type StringFilterMode = (typeof STRING_FILTER_MODES)[number];

export const NUMERIC_FILTER_OPS = ['eq', 'lte', 'gte', 'lt', 'gt'] as const;
export type NumericFilterOp = (typeof NUMERIC_FILTER_OPS)[number];
