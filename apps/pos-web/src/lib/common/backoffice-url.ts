/** In dev, ERP backoffice SPA runs on :3000; prod supplies VITE_BACKOFFICE_WEB_URL. */
const DEFAULT_DEV_BACKOFFICE_ORIGIN = "http://localhost:3000";

/** Absolute URL of the ERP backoffice, for the POS "Trang quản lý" switch. */
export function resolveBackofficeWebUrl(): string {
  const raw = import.meta.env.VITE_BACKOFFICE_WEB_URL;
  if (raw !== undefined && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_BACKOFFICE_ORIGIN;
  }
  return "";
}
