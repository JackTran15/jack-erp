import { ForbiddenException } from '@nestjs/common';
import { GoodsReceiptPurpose } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Per-purpose permission keys. Only "Nhập khác" is gated: PURCHASE and
 * TRANSFER_IN each have a counterparty document (a purchase order, the source
 * branch's phiếu xuất) that the receipt is reconciled against, while OTHER has
 * none — it creates stock out of nothing.
 */
const PURPOSE_PERMISSION_KEYS: Partial<Record<GoodsReceiptPurpose, string>> = {
  [GoodsReceiptPurpose.OTHER]: 'goods_receipt.other-receipt',
};

/**
 * Body-based permission check for goods-receipt creation, mirroring the
 * goods-issue one. The static `@RequirePermission` guard runs before the body is
 * bound, so it cannot vary by `dto.purpose`.
 *
 * Takes the *effective* purpose rather than the raw DTO field: both create paths
 * fall back to OTHER when the client omits it (the column default, and an
 * explicit `?? OTHER` in the v2 handler), so reading `dto.purpose` alone would
 * let an omitted field store an OTHER receipt the actor may not create.
 */
export async function assertReceiptPurposePermission(
  rbac: RbacService,
  actor: ActorContext,
  purpose: GoodsReceiptPurpose | undefined,
): Promise<void> {
  const effective = purpose ?? GoodsReceiptPurpose.OTHER;
  const requiredKey = PURPOSE_PERMISSION_KEYS[effective];
  if (!requiredKey) return;

  const allowed = await rbac.hasPermission(
    actor.userId,
    actor.organizationId,
    requiredKey,
  );
  if (!allowed) {
    throw new ForbiddenException(
      `Missing permission for goods receipt purpose ${effective}`,
    );
  }
}
