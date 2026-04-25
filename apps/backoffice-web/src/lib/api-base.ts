/** In dev, default to Nest API so paths do not hit the Vite SPA shell. */
const DEFAULT_DEV_API_ORIGIN = "http://localhost:4000";

export function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (raw !== undefined && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_API_ORIGIN;
  }
  return "";
}
