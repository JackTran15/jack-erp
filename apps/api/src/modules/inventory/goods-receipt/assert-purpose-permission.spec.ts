import { ForbiddenException } from '@nestjs/common';
import { GoodsReceiptPurpose } from '@erp/shared-interfaces';
import { assertReceiptPurposePermission } from './assert-purpose-permission';

const actor = {
  userId: 'u-1',
  organizationId: 'org-1',
  branchId: 'b-1',
  roles: [],
} as never;

describe('assertReceiptPurposePermission', () => {
  function rbacWith(allowed: boolean) {
    return { hasPermission: jest.fn(async () => allowed) } as never;
  }

  it('lets PURCHASE and TRANSFER_IN through without asking RBAC', async () => {
    const rbac = rbacWith(false);
    await expect(
      assertReceiptPurposePermission(rbac, actor, GoodsReceiptPurpose.PURCHASE),
    ).resolves.toBeUndefined();
    await expect(
      assertReceiptPurposePermission(
        rbac,
        actor,
        GoodsReceiptPurpose.TRANSFER_IN,
      ),
    ).resolves.toBeUndefined();
    expect((rbac as unknown as { hasPermission: jest.Mock }).hasPermission)
      .not.toHaveBeenCalled();
  });

  it('refuses OTHER without goods_receipt.other-receipt', async () => {
    await expect(
      assertReceiptPurposePermission(
        rbacWith(false),
        actor,
        GoodsReceiptPurpose.OTHER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows OTHER when the key is held', async () => {
    await expect(
      assertReceiptPurposePermission(
        rbacWith(true),
        actor,
        GoodsReceiptPurpose.OTHER,
      ),
    ).resolves.toBeUndefined();
  });

  /**
   * Both create paths store OTHER when the client omits the field (column
   * default in v1, an explicit `?? OTHER` in v2), so reading dto.purpose alone
   * would let an omitted field slip past the gate.
   */
  it('treats an omitted purpose as OTHER', async () => {
    const rbac = rbacWith(false);
    await expect(
      assertReceiptPurposePermission(rbac, actor, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (rbac as unknown as { hasPermission: jest.Mock }).hasPermission,
    ).toHaveBeenCalledWith('u-1', 'org-1', 'goods_receipt.other-receipt');
  });
});
