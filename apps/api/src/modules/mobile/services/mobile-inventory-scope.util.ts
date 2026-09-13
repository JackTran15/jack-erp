import { ForbiddenException } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

/**
 * Tập chi nhánh mà lượt gọi này thật sự chạy trên đó.
 *
 * Vắng = MỌI chi nhánh trong JWT của người dùng, KHÔNG phải toàn tổ chức —
 * khác `MobileInvoiceService` (hoá đơn scope tổ chức có chủ ý). Tồn kho là
 * dữ liệu của chi nhánh; một người chỉ được gán hai cửa hàng không có lý do
 * gì thấy tồn của cửa hàng thứ ba. `branchIds` rỗng → `ANY('{}')` → trang
 * rỗng, đúng nghĩa "không được gán cửa hàng nào".
 *
 * Xin một chi nhánh ngoài tầm thì NÉM, không lặng lẽ bỏ nó khỏi tập: bỏ im
 * lặng nghĩa là màn hình nói "3 cửa hàng" trong khi cộng số của 2 — sai theo
 * kiểu không ai phát hiện ra. Cùng lập luận `withBranch` của chứng từ kho.
 */
export function resolveBranchIds(
  actor: ActorContext,
  requested?: string[],
): string[] {
  const allowed = actor.branchIds ?? [];
  if (!requested) return allowed;

  const denied = requested.filter((id) => !allowed.includes(id));
  if (denied.length > 0) {
    throw new ForbiddenException(
      'Bạn không có quyền xem tồn kho của cửa hàng này.',
    );
  }

  return requested;
}
