/** In dev, default to Nest API so paths do not hit the Vite SPA shell. */
const DEFAULT_DEV_API_ORIGIN = "http://localhost:4000";

/**
 * Gốc URL API Nest (ví dụ `http://localhost:4000`).
 * Khác `import.meta.env.BASE_URL` của Vite (prefix đường dẫn khi deploy; dùng cho `basename` router, asset, v.v.).
 */
export function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw !== undefined && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_API_ORIGIN;
  }
  return "";
}
