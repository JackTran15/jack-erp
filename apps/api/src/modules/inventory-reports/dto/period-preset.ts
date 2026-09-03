/**
 * Kỳ báo cáo dùng chung cho mọi DTO của báo cáo kho.
 *
 * Sống ở file riêng chứ không nằm nhờ trong một DTO cụ thể: thứ tự phần tử đi thẳng
 * vào enum của OpenAPI, nên đổi thứ tự là đổi hợp đồng API mà không đổi hành vi.
 */
export const PERIOD_PRESETS = [
  'today',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'custom',
] as const;

export type PeriodPresetLiteral = (typeof PERIOD_PRESETS)[number];
