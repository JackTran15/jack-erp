import type { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";

/** One column's filter: chosen operator + raw text the user typed. */
export interface ColumnFilterState {
  operator: FilterOperatorEnum;
  value: string;
}
