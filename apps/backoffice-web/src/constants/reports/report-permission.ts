import { REPORT_PERMISSION_KEYS } from "@erp/shared-interfaces";
import { hasPermission } from "../../lib/permissions";
import { getReportBackendKey } from "./report-type.constant";

/**
 * The permission a report type needs, or undefined for a type the backend does
 * not serve yet (those are placeholders in the metadata and never reach an API).
 *
 * Derived from `backendKey` rather than stored on the metadata so the client and
 * `ReportPermissionGuard` read the same table and cannot drift.
 */
export function reportPermissionKey(reportType: string): string | undefined {
  const backendKey = getReportBackendKey(reportType);
  return backendKey ? REPORT_PERMISSION_KEYS[backendKey] : undefined;
}

/**
 * The report types of a category this user may actually open.
 *
 * A type with no permission key yet (not wired to the backend) is kept: it is
 * inert, and dropping it would silently shrink the picker for everyone the day a
 * report is added to the list before its endpoint exists.
 */
export function visibleReportTypes(listReport: string[]): string[] {
  return listReport.filter((type) => {
    const key = reportPermissionKey(type);
    return !key || hasPermission(key);
  });
}
