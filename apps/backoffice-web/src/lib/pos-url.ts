/** In dev, POS SPA runs on :3001; prod supplies VITE_POS_WEB_URL. */
const DEFAULT_DEV_POS_ORIGIN = "http://localhost:3001";

/**
 * Suy ra origin của app anh em từ hostname hiện tại bằng cách đổi nhãn
 * subdomain (vd `jack-erp-backoffice.*` → `jack-erp-pos.*`). Trả "" nếu
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

/** Absolute URL of the POS web app, for the sidebar "Bán hàng" switch. */
export function resolvePosWebUrl(): string {
  const raw = import.meta.env.VITE_POS_WEB_URL as string | undefined;
  if (raw !== undefined && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_POS_ORIGIN;
  }
  return deriveSiblingOrigin("backoffice", "pos");
}
