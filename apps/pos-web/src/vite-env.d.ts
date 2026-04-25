/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL gốc của API (Nest). */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_ORG_ID?: string;
  readonly VITE_DEV_LOGIN_EMAIL?: string;
  readonly VITE_DEV_LOGIN_PASSWORD?: string;
}
