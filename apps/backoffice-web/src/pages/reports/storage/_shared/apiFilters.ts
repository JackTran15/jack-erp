import type { PeriodValue } from "@erp/ui";
import type { InventoryReportFilters } from "../../../../api/inventory-reports";
import { ALL_VALUE, type FilterValues } from "./types";

// UUID v4 detector — only forward real branch IDs (not legacy mock codes like
// "MTCANTHO") so the backend doesn't 400 when DTO validates UUIDs.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickUuids(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out: string[] = [];
  for (const v of values) if (typeof v === "string" && UUID_RE.test(v)) out.push(v);
  return out.length > 0 ? out : undefined;
}

function pickSingleUuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

/**
 * Map the shell's `PeriodValue` into the backend's preset / startDate / endDate.
 * The UI exposes a "yesterday" preset that the backend does not — surface it as
 * a custom range.
 */
export function mapPeriodToApi(
  period: PeriodValue | undefined,
): Pick<InventoryReportFilters, "preset" | "startDate" | "endDate"> {
  if (!period) return { preset: "this_month" };
  if (period.preset === "yesterday") {
    return { preset: "custom", startDate: period.from, endDate: period.to };
  }
  if (period.preset === "custom") {
    return { preset: "custom", startDate: period.from, endDate: period.to };
  }
  return { preset: period.preset };
}

interface ResolvedScopeOptions {
  /** Filter key that holds branch UUIDs (radio-scope) — usually "store". */
  storeFieldKey?: string;
  /** Filter key that holds category UUIDs. */
  categoryFieldKey?: string;
  /** Filter key holding a single warehouse UUID (currently unused at API level). */
  warehouseFieldKey?: string;
}

/**
 * Build the API-ready filter object from the shell's `FilterValues` + period.
 * Only real UUIDs are forwarded — legacy mock codes are silently dropped so
 * pages can be migrated without coordinating with a branch-picker rewrite.
 *
 * TODO: once filter dialogs are wired to real branch / category lookups,
 * remove the UUID guard and drop the legacy mock options.
 */
export function buildApiFilters(
  values: FilterValues,
  period: PeriodValue | undefined,
  opts: ResolvedScopeOptions = {},
): InventoryReportFilters {
  const out: InventoryReportFilters = { ...mapPeriodToApi(period) };

  // Branches — radio-scope at `store` key. When mode is "__all__" pass nothing.
  if (opts.storeFieldKey) {
    const mode = values[opts.storeFieldKey];
    if (mode && mode !== ALL_VALUE) {
      const ids = pickUuids(values[`${opts.storeFieldKey}__values`]);
      if (ids) out.branchIds = ids;
    }
  }

  // Categories — single select that may carry a UUID; "__all__" = unrestricted.
  if (opts.categoryFieldKey) {
    const raw = values[opts.categoryFieldKey];
    if (typeof raw === "string" && raw !== ALL_VALUE) {
      const id = pickSingleUuid(raw);
      if (id) out.categoryIds = [id];
    }
  }

  // pageSize is bounded at 200 by the backend; the shell paginates client-side
  // so we ask for the max page to avoid client truncation on small result sets.
  out.pageSize = 200;
  out.page = 1;

  return out;
}

/** Convenience for radio-scope source branch (báo cáo 7). */
export function pickSourceBranchId(
  values: FilterValues,
  fieldKey: string,
): string | undefined {
  const raw = values[fieldKey];
  if (typeof raw === "string") return pickSingleUuid(raw);
  if (Array.isArray(raw) && raw.length > 0) return pickSingleUuid(raw[0]);
  return undefined;
}

