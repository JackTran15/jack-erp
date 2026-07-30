import { EntityManager } from 'typeorm';
import { BranchEntity } from '../../../branch/branch.entity';
import { TransferOrderEntity } from '../../transfer-order/transfer-order.entity';
import { StorageEntity } from '../storage.entity';
import { loadTransferCounterpartStoreName } from './voucher-print-context.util';

interface Call {
  entity: unknown;
  where: Record<string, unknown>;
}

/**
 * A manager that records what it was asked for and answers from a fixture map,
 * so the assertions can be about the query as well as the result — org scoping
 * is only observable in the `where` clause.
 */
function managerOf(rows: {
  order?: Partial<TransferOrderEntity> | null;
  storage?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
}): { manager: EntityManager; calls: Call[] } {
  const calls: Call[] = [];
  const manager = {
    getRepository(entity: unknown) {
      return {
        findOne({ where }: { where: Record<string, unknown> }) {
          calls.push({ entity, where });
          if (entity === TransferOrderEntity) return Promise.resolve(rows.order ?? null);
          if (entity === StorageEntity) return Promise.resolve(rows.storage ?? null);
          if (entity === BranchEntity) return Promise.resolve(rows.branch ?? null);
          return Promise.resolve(null);
        },
      };
    },
  } as unknown as EntityManager;
  return { manager, calls };
}

const ORDER: Partial<TransferOrderEntity> = {
  id: 'to-1',
  sourceBranchId: 'branch-hcm',
  destinationBranchId: 'branch-hn',
  sourceStorageId: 'storage-hcm',
  destinationStorageId: 'storage-hn',
};

describe('loadTransferCounterpartStoreName', () => {
  it('names the source store for the inbound receipt leg', async () => {
    const { manager, calls } = managerOf({
      order: ORDER,
      storage: { id: 'storage-hcm', name: 'Kho tổng' },
    });

    const name = await loadTransferCounterpartStoreName(
      manager,
      'receipt',
      'gr-1',
      'org-1',
    );

    expect(name).toBe('Kho tổng');
    expect(calls[0].where).toEqual({
      importGoodsReceiptId: 'gr-1',
      organizationId: 'org-1',
    });
    expect(calls[1].where).toEqual({ id: 'storage-hcm' });
  });

  it('names the destination store for the outbound issue leg', async () => {
    const { manager, calls } = managerOf({
      order: ORDER,
      storage: { id: 'storage-hn', name: 'Kho Hà Nội' },
    });

    const name = await loadTransferCounterpartStoreName(
      manager,
      'issue',
      'gi-1',
      'org-1',
    );

    expect(name).toBe('Kho Hà Nội');
    expect(calls[0].where).toEqual({
      exportGoodsIssueId: 'gi-1',
      organizationId: 'org-1',
    });
  });

  it('scopes the lookup to the organization', async () => {
    const { manager, calls } = managerOf({ order: null });

    await loadTransferCounterpartStoreName(manager, 'receipt', 'gr-1', 'org-1');

    expect(calls[0].where).toHaveProperty('organizationId', 'org-1');
  });

  it('returns null for a document that is not part of a transfer', async () => {
    const { manager, calls } = managerOf({ order: null });

    const name = await loadTransferCounterpartStoreName(
      manager,
      'receipt',
      'gr-1',
      'org-1',
    );

    expect(name).toBeNull();
    // One query and no more when there is nothing to resolve.
    expect(calls).toHaveLength(1);
  });

  it('falls back to the branch name when the transfer has no storage set', async () => {
    const { manager } = managerOf({
      order: { ...ORDER, sourceStorageId: undefined },
      branch: { id: 'branch-hcm', name: 'Chi nhánh HCM' },
    });

    const name = await loadTransferCounterpartStoreName(
      manager,
      'receipt',
      'gr-1',
      'org-1',
    );

    expect(name).toBe('Chi nhánh HCM');
  });

  it('falls back to the branch name when the storage id resolves to nothing', async () => {
    const { manager } = managerOf({
      order: ORDER,
      storage: null,
      branch: { id: 'branch-hcm', name: 'Chi nhánh HCM' },
    });

    const name = await loadTransferCounterpartStoreName(
      manager,
      'receipt',
      'gr-1',
      'org-1',
    );

    expect(name).toBe('Chi nhánh HCM');
  });
});
