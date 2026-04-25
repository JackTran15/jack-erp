import type { IncomingHttpHeaders } from 'node:http';

/** Minimal request shape for branch resolution (works with Express `Request` and Nest `getRequest()`). */
export interface BranchResolutionRequest {
  headers: IncomingHttpHeaders;
  body?: { branchId?: unknown };
  params?: { branchId?: unknown };
  query?: { branchId?: unknown };
}

/** Raw branch id from `X-Branch-Id` (trimmed), if present. */
export function parseHeaderBranchId(req: BranchResolutionRequest): string | undefined {
  const raw = req.headers['x-branch-id'];
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim();
  return undefined;
}

/**
 * Branch explicitly targeted by the request: body, route param, query, then `X-Branch-Id`.
 * Must match {@link Actor} / client conventions so guards and handlers agree.
 */
export function resolveExplicitBranchId(req: BranchResolutionRequest): string | undefined {
  const bodyId = req.body?.branchId;
  if (typeof bodyId === 'string' && bodyId.trim() !== '') return bodyId.trim();

  const paramId = req.params?.branchId;
  if (typeof paramId === 'string' && paramId.trim() !== '') return paramId.trim();

  const q = req.query?.branchId;
  if (typeof q === 'string' && q.trim() !== '') return q.trim();
  if (Array.isArray(q) && q[0]) return String(q[0]).trim();

  return parseHeaderBranchId(req);
}
