/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL gốc của API (Nest). */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_ORG_ID?: string;
  readonly VITE_DEV_LOGIN_EMAIL?: string;
  readonly VITE_DEV_LOGIN_PASSWORD?: string;
  readonly VITE_BACKOFFICE_WEB_URL?: string;
  /** "true" = checkout đi qua `/v2/pos/checkout` (saga); mặc định = luồng cũ (T-05-03). */
  readonly VITE_CHECKOUT_V2?: string;
}
