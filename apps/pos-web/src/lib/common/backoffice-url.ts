/** In dev, ERP backoffice SPA runs on :3000; prod supplies VITE_BACKOFFICE_WEB_URL. */
const DEFAULT_DEV_BACKOFFICE_ORIGIN = "http://localhost:3000";

/**
 * Suy ra origin của app anh em từ hostname hiện tại bằng cách đổi nhãn
 * subdomain (vd `jack-erp-pos.*` → `jack-erp-backoffice.*`). Trả "" nếu
 * không khớp mẫu để caller tự xử lý.
 */
function deriveSiblingOrigin(from: string, to: string): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  const parts = host.split(".");
  if (!parts[0]?.includes(from)) return "";
  parts[0] = parts[0].replace(from, to);
  return `${protocol}//${parts.join(".")}`;
}

/** Absolute URL of the ERP backoffice, for the POS "Trang quản lý" switch. */
export function resolveBackofficeWebUrl(): string {
  const raw = import.meta.env.VITE_BACKOFFICE_WEB_URL;
  if (raw !== undefined && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_BACKOFFICE_ORIGIN;
  }
  return deriveSiblingOrigin("pos", "backoffice");
}
