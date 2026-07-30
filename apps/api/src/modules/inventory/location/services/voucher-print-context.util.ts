import { DocumentBranchInfo } from '@erp/shared-interfaces';
import { EntityManager, In } from 'typeorm';
import { BranchEntity } from '../../../branch/branch.entity';
import { TransferOrderEntity } from '../../transfer-order/transfer-order.entity';
import { StorageEntity } from '../storage.entity';

/**
 * Shared lookups for the stock-voucher print/export mappers (T-03-02, UOW-08).
 *
 * None of `GoodsReceiptEntity` / `GoodsIssueEntity` / `TransferOrderEntity` eager-loads
 * its own branch, and a line's `location` only carries the bin (`LocationEntity`), not
 * the parent warehouse (`StorageEntity`) — so both need one extra query per voucher,
 * done here once instead of three times.
 */

export async function loadVoucherBranch(
  manager: EntityManager,
  branchId: string | undefined | null,
  organizationId: string,
): Promise<DocumentBranchInfo | null> {
  if (!branchId) return null;
  const branch = await manager.getRepository(BranchEntity).findOne({
    where: { id: branchId, organizationId },
  });
  if (!branch) return null;
  return {
    name: branch.name,
    address: branch.address ?? null,
    phone: branch.phone ?? null,
  };
}

/** Batch-resolves warehouse names for a set of storage ids, keyed by storage id. */
export async function loadStorageNames(
  manager: EntityManager,
  storageIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(storageIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const storages = await manager
    .getRepository(StorageEntity)
    .find({ where: { id: In(ids) } });
  return new Map(storages.map((storage) => [storage.id, storage.name]));
}

/** Which leg of a transfer a stock voucher is, when it is one at all. */
export type TransferLeg = 'receipt' | 'issue';

/**
 * The other store's name when this voucher is one leg of a transfer, else null.
 *
 * The reference vouchers print "Cửa hàng xuất điều chuyển" on the inbound
 * receipt and "Cửa hàng nhận điều chuyển" on the outbound issue, and print
 * neither on an ordinary purchase or issue — so returning null is a real answer,
 * not a failure.
 *
 * Prefers the warehouse name and falls back to the branch name: a transfer
 * always has both branches, but `source_storage_id` / `destination_storage_id`
 * are nullable.
 */
export async function loadTransferCounterpartStoreName(
  manager: EntityManager,
  leg: TransferLeg,
  documentId: string,
  organizationId: string,
): Promise<string | null> {
  const order = await manager.getRepository(TransferOrderEntity).findOne({
    where:
      leg === 'receipt'
        ? { importGoodsReceiptId: documentId, organizationId }
        : { exportGoodsIssueId: documentId, organizationId },
  });
  if (!order) return null;

  const storageId =
    leg === 'receipt' ? order.sourceStorageId : order.destinationStorageId;
  if (storageId) {
    const storage = await manager
      .getRepository(StorageEntity)
      .findOne({ where: { id: storageId } });
    if (storage) return storage.name;
  }

  const branchId =
    leg === 'receipt' ? order.sourceBranchId : order.destinationBranchId;
  const branch = await manager
    .getRepository(BranchEntity)
    .findOne({ where: { id: branchId, organizationId } });
  return branch?.name ?? null;
}
