import type { ColumnFilter, ColumnFilterMode } from "../table/pagination.dto";

/**
 * Registry of admin entityKeys that have a server-side CQRS search endpoint
 * (`POST /v2/<entity>/search`). `CrudListPage` uses this to switch those lists
 * from client-side filtering to server-side filtering + pagination. Any
 * entityKey NOT listed here keeps the generic `GET /records` behaviour.
 *
 * `fields` declares which column keys map to a v2 filter and how — only these
 * keys are ever sent (the backend runs `forbidNonWhitelisted`).
 */
export type V2FieldKind =
  | "string"
  | "enum"
  | "boolean"
  | "date-range"
  | "compare";

export interface V2SearchConfig {
  path: string;
  fields: Record<string, V2FieldKind>;
}

export const CRUD_V2_SEARCH: Record<string, V2SearchConfig> = {
  customers: {
    path: "/v2/customers/search",
    fields: {
      code: "string",
      name: "string",
      email: "string",
      phone: "string",
      status: "enum",
      createdAt: "date-range",
    },
  },
  "inventory-providers": {
    path: "/v2/inventory-providers/search",
    fields: {
      code: "string",
      name: "string",
      email: "string",
      phone: "string",
      taxCode: "string",
      type: "enum",
      isActive: "boolean",
      isCustomer: "boolean",
      createdAt: "date-range",
    },
  },
  "job-positions": {
    path: "/v2/job-positions/search",
    fields: {
      name: "string",
      code: "string",
      isActive: "boolean",
      createdAt: "date-range",
    },
  },
  accounts: {
    path: "/v2/accounts/search",
    fields: {
      code: "string",
      name: "string",
      type: "enum",
      isActive: "boolean",
      createdAt: "date-range",
    },
  },
  "inventory-items": {
    path: "/v2/inventory-items/search",
    fields: {
      code: "string",
      barcode: "string",
      name: "string",
      unit: "string",
      brand: "string",
      purchasePrice: "compare",
      sellingPrice: "compare",
      isPosVisible: "boolean",
      isActive: "boolean",
    },
  },
  "inventory-item-categories": {
    path: "/v2/inventory-item-categories/search",
    fields: {
      code: "string",
      name: "string",
      createdAt: "date-range",
    },
  },
};

/** FE filter mode → backend `StringOperator` symbol. */
const MODE_TO_STRING_OP: Record<ColumnFilterMode, "*" | "=" | "+" | "-" | "!"> = {
  contains: "*",
  equals: "=",
  startsWith: "+",
  endsWith: "-",
  notContains: "!",
};

export interface V2SearchResponse<T = Record<string, unknown>> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/** A single `ColumnFilter` → backend `StringFilter`, or undefined when empty. */
export function columnToStringFilter(
  filter?: ColumnFilter,
): { operator: "*" | "=" | "+" | "-" | "!"; value: string } | undefined {
  const value = filter?.value?.trim();
  if (!value) return undefined;
  return { operator: MODE_TO_STRING_OP[filter!.mode] ?? "*", value };
}

/**
 * Builds the `POST /v2/<entity>/search` request body from the per-column filter
 * state. Emits ONLY keys declared in `cfg.fields`; skips empty values.
 */
export function buildV2Body(
  cfg: V2SearchConfig,
  filters: Record<string, ColumnFilter>,
  page: number,
  limit: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = { page, limit };
  for (const [key, kind] of Object.entries(cfg.fields)) {
    const f = filters[key];
    if (!f) continue;

    if (kind === "date-range") {
      const from = f.from?.trim();
      const to = f.to?.trim();
      if (from || to) {
        body[key] = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
      }
      continue;
    }

    const value = f.value?.trim();
    if (!value) continue;
    if (kind === "string") {
      body[key] = { operator: MODE_TO_STRING_OP[f.mode] ?? "*", value };
    } else if (kind === "enum") {
      body[key] = { value };
    } else if (kind === "boolean") {
      if (value === "true") body[key] = true;
      else if (value === "false") body[key] = false;
    } else if (kind === "compare") {
      // The number-range filter cell is a fixed "≤ value" input.
      body[key] = { operator: "<=", value };
    }
  }
  return body;
}
