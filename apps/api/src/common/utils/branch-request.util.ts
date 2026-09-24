import { ForbiddenException } from '@nestjs/common';
import type { ActorContext } from '../decorators/actor-context.decorator';
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

/**
 * Bản sao của [actor] đã được đưa về chi nhánh [requested].
 *
 * `@Actor` giải chi nhánh theo thứ tự **`jwt > header > jwtList`**, mà
 * `AuthService.login` luôn nhét `branchId = branchIds[0]` vào token. Hệ quả:
 * header `X-Branch-Id` mà app gửi KHÔNG BAO GIỜ thắng. Đã đo nhiều lần — ba
 * chi nhánh khác nhau trả về cùng một tập chứng từ, và hai chi nhánh khác nhau
 * trả về cùng một tập hoá đơn đổi trả (2026-09-24).
 *
 * Nên cửa hàng phải đi qua QUERY, và đây là chỗ duy nhất giải nó. Trả về một
 * BẢN SAO thay vì sửa tại chỗ: `ActorContext` được dùng lại ở nhiều nhánh trong
 * cùng một request, và sửa nó là đổi ngầm phạm vi của những nhánh khác.
 *
 * Yêu cầu một chi nhánh ngoài tầm thì **NÉM**, không lặng lẽ lùi về mặc định:
 * lùi im lặng nghĩa là màn hình nói "Chi nhánh Hà Nội" trong khi bày dữ liệu
 * của chi nhánh khác — sai theo kiểu không ai phát hiện ra.
 *
 * Ở CHUNG file với {@link resolveExplicitBranchId} vì hai hàm trả lời hai nửa
 * của cùng một câu hỏi: hàm kia nói request ĐANG NHẮM chi nhánh nào, hàm này
 * nói người gọi có được phép đứng ở đó không. Trước 2026-09-24 nó là hai bản
 * sao giống hệt nhau nằm trong hai service — một hàm về phạm vi truy cập thì
 * hai bản là hai chỗ có thể phân kỳ mà không ai thấy.
 */
export function withBranch(actor: ActorContext, requested?: string): ActorContext {
  if (!requested || requested === actor.branchId) return actor;

  if (!actor.branchIds?.includes(requested)) {
    throw new ForbiddenException(`Access denied for branch: ${requested}`);
  }

  return { ...actor, branchId: requested };
}
