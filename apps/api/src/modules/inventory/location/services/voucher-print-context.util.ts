import { DocumentBranchInfo } from '@erp/shared-interfaces';
import { EntityManager, In } from 'typeorm';
import { BranchEntity } from '../../../branch/branch.entity';
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
