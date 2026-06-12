import type { PeriodValue } from "@erp/ui";

export interface FilterFieldOption {
  value: string;
  label: string;
  branchId?: string;
}

interface BaseField {
  key: string;
  label: string;
  required?: boolean;
  /** Return false to hide this field (and reset its value) when the popover submits. */
  visibleWhen?: (draft: FilterValues) => boolean;
}

export type FilterField =
  | (BaseField & {
      type: "select";
      options: FilterFieldOption[];
      placeholder?: string;
      /** Key of a radio-scope field; filters options to branches selected in that field. */
      dependsOn?: string;
    })
  | (BaseField & {
      type: "multi-select";
      options: FilterFieldOption[];
      placeholder?: string;
    })
  | (BaseField & {
      /**
       * Two-radio + optional multi-select. When the user picks the "scoped"
       * radio (e.g. "Theo nhóm cửa hàng"), a multi-select appears below to
       * pick the actual values.
       */
      type: "radio-scope";
      allLabel: string;
      scopeLabel: string;
      options: FilterFieldOption[];
      placeholder?: string;
    })
  | (BaseField & { type: "period" });

/** Value shape stored in `FilterValues`:
 * - select / radio-scope[all]: string  ("__all__" if all)
 * - multi-select / radio-scope[scope]: string[]
 * - period: PeriodValue
 */
export type FilterValues = Record<
  string,
  string | string[] | PeriodValue | undefined
>;

export const ALL_VALUE = "__all__";

export interface SubtitleSegment {
  label: string;
  /** Resolved display value, already humanized. */
  value: string;
}
