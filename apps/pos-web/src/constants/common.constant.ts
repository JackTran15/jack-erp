import type { PosDateRangeFilterChoice } from "@erp/pos/lib/common/dateRangeFilter";

export const DATE_RANGE_FILTER_CHOICES: ReadonlyArray<PosDateRangeFilterChoice> = [
  { value: "ALL", label: "Toàn bộ" },
  { value: "TODAY", label: "Hôm nay" },
  { value: "YESTERDAY", label: "Hôm qua" },
  { value: "LAST_7_DAYS", label: "7 ngày gần đây" },
  { value: "LAST_14_DAYS", label: "14 ngày gần đây" },
  { value: "THIS_WEEK", label: "Tuần này" },
  { value: "LAST_WEEK", label: "Tuần trước" },
  { value: "THIS_MONTH", label: "Tháng này" },
  { value: "LAST_MONTH", label: "Tháng trước" },
  { value: "THREE_MONTHS_AGO", label: "Ba tháng trước" },
  { value: "SIX_MONTHS_AGO", label: "Sáu tháng trước" },
  { value: "OTHER", label: "Khác" },
];

/**
 * localStorage keys for the POS session.
 *
 * Namespaced with `pos_` because POS and the ERP backoffice are served from the
 * SAME origin (erp.giaymt.com.vn/ and /pos/), so they share one localStorage.
 * Un-namespaced keys collided: the backoffice deletes "access_token" on login,
 * and both apps wrote "refresh_token" — and since /auth/refresh rotates and
 * revokes, whichever app refreshed first silently logged the other out.
 *
 * POS deliberately keeps its own session (see PosLoginPage + the /auth/handoff
 * flow); it does not share one with the backoffice. Matches the existing
 * `pos_active_branch_id` convention in lib/common/posBranchStorage.ts.
 *
 * Never remove the un-namespaced keys from POS — they belong to the backoffice.
 */
export const POS_ACCESS_TOKEN_KEY = "pos_access_token";
export const POS_REFRESH_TOKEN_KEY = "pos_refresh_token";
export const POS_ORGANIZATION_ID_KEY = "pos_organization_id";
