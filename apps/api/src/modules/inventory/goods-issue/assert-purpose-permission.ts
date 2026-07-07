import { ForbiddenException } from '@nestjs/common';
import { GoodsIssuePurpose } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Per-purpose permission keys. Only the "special" purposes are gated; SALE and
 * TRANSFER_OUT stay behind the base `inventory.write` guard.
 */
const PURPOSE_PERMISSION_KEYS: Partial<Record<GoodsIssuePurpose, string>> = {
  [GoodsIssuePurpose.OTHER]: 'inventory.goods-issue.other-issue',
  [GoodsIssuePurpose.DISPOSAL]: 'inventory.goods-issue.disposal',
};

/**
 * Body-based permission check for goods-issue creation. The static
 * `@RequirePermission` guard runs before the request body is bound, so it cannot
 * vary by `dto.purpose`; this closes that gap. Throws ForbiddenException when the
 * actor lacks the purpose-specific key for an OTHER/DISPOSAL issue and is a no-op
 * for every other purpose (SALE, TRANSFER_OUT).
 */
export async function assertPurposePermission(
  rbac: RbacService,
  actor: ActorContext,
  purpose: GoodsIssuePurpose,
): Promise<void> {
  const requiredKey = PURPOSE_PERMISSION_KEYS[purpose];
  if (!requiredKey) return;

  const allowed = await rbac.hasPermission(
    actor.userId,
    actor.organizationId,
    requiredKey,
  );
  if (!allowed) {
    throw new ForbiddenException(
      `Missing permission for goods issue purpose ${purpose}`,
    );
  }
}
