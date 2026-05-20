import type { UserSummary } from "@erp/shared-interfaces";

export function joinFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(" ");
  if (space <= 0) {
    return { firstName: trimmed, lastName: trimmed || "—" };
  }
  return {
    firstName: trimmed.slice(0, space).trim(),
    lastName: trimmed.slice(space + 1).trim() || "—",
  };
}

export function userDisplayCode(
  user: Pick<UserSummary, "id" | "email">,
): string {
  const local = user.email.split("@")[0];
  return local || user.id.slice(0, 8);
}

export function formatIamDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN").format(d);
}

/** Ngày + giờ:phút (vd. đăng nhập gần nhất). */
export function formatIamDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function formatAccountStatus(isActive: boolean): string {
  return isActive ? "Đang hoạt động" : "Ngừng hoạt động";
}
