import type { FieldDefinition, PaginationQuery } from "@erp/shared-interfaces";

export interface PaginationStateDto extends PaginationQuery {
  search?: string;
}

export const TABLE_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export type ColumnFilterMode =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "notContains";

export interface ColumnFilter {
  mode: ColumnFilterMode;
  value: string;
}

export const DEFAULT_COLUMN_FILTER_MODE: ColumnFilterMode = "contains";

export const COLUMN_FILTER_MODE_OPTIONS: Array<{
  value: ColumnFilterMode;
  symbol: string;
  label: string;
}> = [
  { value: "contains", symbol: "*", label: "Chứa" },
  { value: "equals", symbol: "=", label: "Bằng" },
  { value: "startsWith", symbol: "+", label: "Bắt đầu bằng" },
  { value: "endsWith", symbol: "-", label: "Kết thúc bằng" },
  { value: "notContains", symbol: "!", label: "Không chứa" },
];

export type ColumnWidthVariant = "small" | "medium" | "large";
export type ColumnTextAlign = "left" | "right";
export type ColumnFormatKind = "default" | "numberVi" | "moneyVnd" | "customerStatus";

export interface ColumnPresentation {
  align?: ColumnTextAlign;
  format?: ColumnFormatKind;
  maxFractionDigits?: number;
}

export interface ColumnConfig extends ColumnPresentation {
  width?: ColumnWidthVariant;
}

export const TABLE_COLUMN_WIDTH_PX: Record<ColumnWidthVariant, number> = {
  small: 120,
  medium: 180,
  large: 260,
};

/** Per-entity column config overrides (width + alignment + value format). */
export const ENTITY_COLUMN_CONFIGS: Record<
  string,
  Record<string, ColumnConfig>
> = {
  "inventory-items": {
    code: { width: "medium" },
    name: { width: "large" },
    categoryName: { width: "medium" },
    unit: { width: "small" },
    brand: { width: "medium" },
    purchasePrice: { width: "medium", align: "right", format: "moneyVnd" },
    sellingPrice: { width: "medium", align: "right", format: "moneyVnd" },
    isPosVisible: { width: "small" },
    itemType: { width: "medium" },
    isActive: { width: "small" },
  },
  customers: {
    status: { format: "customerStatus" },
  },
};

export const DEFAULT_PAGINATION: PaginationStateDto = {
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  search: "",
};

export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, totalPages));
}

/** Total for PaginationControls when API doesn't return `total`. */
export function resolveLookupPaginationTotal(
  total: number | null,
  hasMore: boolean,
  page: number,
  pageSize: number,
  itemsLength: number,
): { total: number; estimated: boolean } {
  if (total != null) {
    return { total, estimated: false };
  }
  if (hasMore) {
    return { total: page * pageSize + 1, estimated: true };
  }
  return {
    total: Math.max(0, (page - 1) * pageSize + itemsLength),
    estimated: true,
  };
}

export function describeFilterMode(mode: ColumnFilterMode): string {
  const option = COLUMN_FILTER_MODE_OPTIONS.find((item) => item.value === mode);
  return option ? `${option.symbol}: ${option.label}` : "Chứa";
}

export function toComparableText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function applyColumnFilter(
  comparable: string,
  filter: ColumnFilter,
): boolean {
  const haystack = comparable.toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return true;

  switch (filter.mode) {
    case "contains":
      return haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    case "notContains":
      return !haystack.includes(needle);
    default:
      return true;
  }
}

export function resolveColumnConfig(
  entityKey: string,
  field: FieldDefinition,
): {
  widthPx: number;
  align: ColumnTextAlign;
  format?: ColumnFormatKind;
} {
  const configured = ENTITY_COLUMN_CONFIGS[entityKey]?.[field.key];
  const configuredWidthVariant = configured?.width;

  const key = field.key.toLowerCase();
  const fallbackWidthVariant: ColumnWidthVariant =
    key.includes("name") ||
    key.includes("description") ||
    key.includes("address") ||
    key.includes("providerid")
      ? "large"
      : key.includes("unit") ||
          key === "id" ||
          key.endsWith("id") ||
          key.includes("code") ||
          field.type === "boolean"
        ? "small"
        : "medium";

  const widthVariant = configuredWidthVariant ?? fallbackWidthVariant;
  const widthPx = TABLE_COLUMN_WIDTH_PX[widthVariant];

  const format =
    configured?.format ??
    (field.type === "number" ? ("numberVi" satisfies ColumnFormatKind) : undefined);

  const align = configured?.align ?? (field.type === "number" ? "right" : "left");

  return { widthPx, align, format };
}
