/** In dev, POS SPA runs on :3001; prod supplies VITE_POS_WEB_URL. */
const DEFAULT_DEV_POS_ORIGIN = "http://localhost:3001";

/** Absolute URL of the POS web app, for the sidebar "Bán hàng" switch. */
export function resolvePosWebUrl(): string {
  const raw = import.meta.env.VITE_POS_WEB_URL as string | undefined;
  if (raw !== undefined && String(raw).trim() !== "") {
    return String(raw).trim().replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_POS_ORIGIN;
  }
  return "";
}
