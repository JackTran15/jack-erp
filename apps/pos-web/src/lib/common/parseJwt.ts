/** Đọc payload JWT (không ký) để lấy userId, branchIds — chỉ dùng cho UI. */
export function parseAccessTokenPayload(
  accessToken: string,
): {
  userId: string;
  branchIds: string[];
  organizationId: string | null;
  exp: number | null;
} | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]!;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
    const json = atob(padded);
    const o = JSON.parse(json) as {
      userId?: string;
      organizationId?: string;
      exp?: number;
      branchIds?: string[];
    };
    if (typeof o.userId !== "string") return null;
    const branchIds = Array.isArray(o.branchIds)
      ? o.branchIds.filter((b): b is string => typeof b === "string")
      : [];
    return {
      userId: o.userId,
      organizationId: typeof o.organizationId === "string" ? o.organizationId : null,
      exp: typeof o.exp === "number" ? o.exp : null,
      branchIds,
    };
  } catch {
    return null;
  }
}
