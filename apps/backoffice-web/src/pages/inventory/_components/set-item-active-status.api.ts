import { apiClient } from "../../../lib/api-axios";

export interface SetItemActiveStatusSkipped {
  code: string;
  reason: string;
}

export interface SetItemActiveStatusResult {
  updated: number;
  skipped: SetItemActiveStatusSkipped[];
}

/**
 * Stable key for one logical operation, so a double-click or a retry replays the
 * stored response instead of writing twice.
 *
 * The axios interceptor mints a fresh UUID per request when no key is supplied
 * (`api-axios.ts`), which would make every retry look like a new mutation and
 * defeat the server's dedupe entirely. Deriving the key from the payload is what
 * makes `X-Idempotency-Key` mean anything here.
 */
function operationKey(ids: string[], isActive: boolean): string {
  const payload = `${isActive ? "on" : "off"}:${[...ids].sort().join(",")}`;
  // FNV-1a — enough to separate operations within a session, and no dependency.
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `set-item-active-${hash.toString(16)}-${ids.length}`;
}

/**
 * Bulk "Đang kinh doanh" / "Ngừng kinh doanh".
 *
 * `ids` are grid row ids as-is — a grouped row's products.id expands to all its
 * variants on the server, so the caller does not have to resolve variants.
 */
export async function setItemActiveStatus(
  ids: string[],
  isActive: boolean,
): Promise<SetItemActiveStatusResult> {
  const { data } = await apiClient.post<SetItemActiveStatusResult>(
    "/inventory/items/set-active-status",
    { ids, isActive },
    { headers: { "X-Idempotency-Key": operationKey(ids, isActive) } },
  );
  return data;
}
