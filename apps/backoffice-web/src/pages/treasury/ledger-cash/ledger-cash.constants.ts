export const LEDGER_CASH_VI_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

export const LEDGER_CASH_VI_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export const VOUCHER_FORM_LABEL_WIDTH = "10rem";

export const READONLY_INPUT_CLASS = "bg-muted/30";

export const TABLE_NUM_CLASS = "text-right tabular-nums";

export const DOCUMENT_SECTION_LABELS = {
  GENERAL_INFO: "Thông tin chung",
  DOCUMENT: "Chứng từ",
  DETAIL: "Chi tiết",
} as const;

export const DOCUMENT_SECTION_HEADING_CLASS =
  "mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground";
