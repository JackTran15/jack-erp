import type { FieldDefinition } from "@erp/shared-interfaces";
import { formatCustomerStatus } from "./customer-display";

const BUSINESS_STATUS_VI: Record<string, string> = {
  ACTIVE: "Đang kinh doanh",
  INACTIVE: "Ngừng kinh doanh",
};

export function formatCrudFieldValue(value: unknown, field: FieldDefinition): string {
  if (value === null || value === undefined) return "—";
  if (isBusinessStatusField(field)) {
    return BUSINESS_STATUS_VI[String(value)] ?? String(value);
  }
  if (field.key === "status") return formatCustomerStatus(value);
  return String(value);
}

export function formatCrudEnumOption(field: FieldDefinition, value: string): string {
  if (isBusinessStatusField(field)) {
    return BUSINESS_STATUS_VI[value] ?? value;
  }
  return field.key === "status" ? formatCustomerStatus(value) : value;
}

function isBusinessStatusField(field: FieldDefinition): boolean {
  return (
    field.key === "status" &&
    field.enumValues?.length === 2 &&
    field.enumValues.includes("ACTIVE") &&
    field.enumValues.includes("INACTIVE")
  );
}
