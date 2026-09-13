import { ForbiddenException } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * Tập chi nhánh mà một báo cáo TIỀN / danh sách HOÁ ĐƠN của mobile được đọc:
 * **đúng tập PHÂN CÔNG** (`user_branch_assignments`, có sẵn trong JWT là
 * `actor.branchIds`), không hơn.
 *
 * Bản mobile của `resolveReportBranchIds` (`reporting/report-core/
 * report-query.util.ts`) nhưng CỐ Ý KHÔNG chép vế hợp nhất
 * (`reporting.*.consolidated.read` → toàn tổ chức). Quyết định 2026-09-12,
 * chốt với người dùng, vì web tự mâu thuẫn ở chỗ này: header và "Kết quả kinh
 * doanh" liệt kê `/branches/me` (phân công), còn "Doanh thu theo mặt hàng" và
 * "Bảng kê hoá đơn" liệt kê mọi chi nhánh tổ chức và "Tất cả" cộng toàn tổ
 * chức khi có quyền hợp nhất. Mobile chỉ có MỘT danh sách cửa hàng
 * (`/mobile/branches`, phân công) dùng cho mọi bộ lọc, nên số liệu phải cộng
 * trên đúng tập đó — bày 3 cửa hàng mà cộng 5 là màn hình nói dối. Cùng khuôn
 * `resolveBranchIds` của tồn kho; muốn xem chi nhánh nào thì phân công chi
 * nhánh đó.
 *
 * - Không phân công → 403, KHÔNG lặng lẽ trả rỗng: rỗng ở một báo cáo doanh
 *   thu đọc ra là "toàn chuỗi không bán được gì".
 * - Xin một chi nhánh ngoài phân công → 403, không lặng lẽ bỏ nó khỏi tập —
 *   cùng lập luận `resolveBranchIds` của tồn kho.
 *
 * Khác `resolveBranchIds` (tồn kho) ở đúng vế "không phân công": tồn kho trả
 * `[]` (trang rỗng), tiền thì 403 — giữ hai hàm vì hai câu lỗi và hai hành vi
 * đều có chủ ý.
 */
export function resolveReportBranchScope(params: {
  requested?: string[];
  actor: ActorContext;
}): string[] {
  const { requested, actor } = params;
  const assigned = actor.branchIds ?? [];

  if (!assigned.length) {
    throw new ForbiddenException('No branch access assigned');
  }

  if (!requested?.length) return assigned;

  const ids = [...new Set(requested)];
  const permitted = new Set(assigned);
  const denied = ids.filter((id) => !permitted.has(id));
  if (denied.length) {
    throw new ForbiddenException(
      `Access denied for stores: ${denied.join(', ')}`,
    );
  }
  return ids;
}
