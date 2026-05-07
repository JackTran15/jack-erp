export enum FilterOperatorEnum {
  CONTAINS = "CONTAINS",
  EQUALS = "EQUALS",
  STARTS_WITH = "STARTS_WITH",
  ENDS_WITH = "ENDS_WITH",
  NOT_CONTAINS = "NOT_CONTAINS",
  LESS_THAN = "LESS_THAN",
  LESS_THAN_OR_EQUAL = "LESS_THAN_OR_EQUAL",
  GREATER_THAN = "GREATER_THAN",
  GREATER_THAN_OR_EQUAL = "GREATER_THAN_OR_EQUAL",
}

export enum FilterOperatorTypeEnum {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
}

export interface FilterOperatorOption {
  value: FilterOperatorEnum;
  selectedDisplay: string;
  label: string;
}

export const OPERATOR_OPTIONS: Record<
  FilterOperatorTypeEnum,
  ReadonlyArray<FilterOperatorOption>
> = {
  [FilterOperatorTypeEnum.TEXT]: [
    {
      value: FilterOperatorEnum.CONTAINS,
      selectedDisplay: "*",
      label: "* : Chứa",
    },
    {
      value: FilterOperatorEnum.EQUALS,
      selectedDisplay: "=",
      label: "= : Bằng",
    },
    {
      value: FilterOperatorEnum.STARTS_WITH,
      selectedDisplay: "+",
      label: "+ : Bắt đầu bằng",
    },
    {
      value: FilterOperatorEnum.ENDS_WITH,
      selectedDisplay: "-",
      label: "- : Kết thúc bằng",
    },
    {
      value: FilterOperatorEnum.NOT_CONTAINS,
      selectedDisplay: "!",
      label: "! : Không chứa",
    },
  ],
  [FilterOperatorTypeEnum.NUMBER]: [
    {
      value: FilterOperatorEnum.EQUALS,
      selectedDisplay: "=",
      label: "= : Bằng",
    },
    {
      value: FilterOperatorEnum.LESS_THAN,
      selectedDisplay: "<",
      label: "< : Nhỏ hơn",
    },
    {
      value: FilterOperatorEnum.LESS_THAN_OR_EQUAL,
      selectedDisplay: "≤",
      label: "≤ : Nhỏ hơn hoặc bằng",
    },
    {
      value: FilterOperatorEnum.GREATER_THAN,
      selectedDisplay: ">",
      label: "> : Lớn hơn",
    },
    {
      value: FilterOperatorEnum.GREATER_THAN_OR_EQUAL,
      selectedDisplay: "≥",
      label: "≥ : Lớn hơn hoặc bằng",
    },
  ],
};
