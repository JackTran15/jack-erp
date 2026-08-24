import {
  POS_ACCESS_TOKEN_KEY,
  POS_REFRESH_TOKEN_KEY,
} from "@erp/pos/constants/common.constant";
import { resolveApiBaseUrl } from "./api-base";

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem(POS_REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${resolveApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
      localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
      return false;
    }

    const data = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };

    if (!data.accessToken) {
      localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
      localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
      return false;
    }

    localStorage.setItem(POS_ACCESS_TOKEN_KEY, data.accessToken);
    if (data.refreshToken) {
      localStorage.setItem(POS_REFRESH_TOKEN_KEY, data.refreshToken);
    }
    return true;
  } catch {
    localStorage.removeItem(POS_ACCESS_TOKEN_KEY);
    localStorage.removeItem(POS_REFRESH_TOKEN_KEY);
    return false;
  }
}

/**
 * Single-flight token refresh shared by both API clients (`http.ts`'s
 * fetch-based client and `api-axios.ts`'s axios-based client). Any failure
 * path — non-ok response, thrown/network error, or a response missing
 * `accessToken` — clears both stored tokens and resolves to `false`.
 */
export function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
