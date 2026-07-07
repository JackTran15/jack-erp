import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { TransferByBranchRow } from '../../services/transfer-report.service';
import { TransferByStoreReport } from './transfer-by-store.report';

const actorNoBranch = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;
const actorWithBranch = {
  ...actorNoBranch,
  branchId: 'b1',
  branchIds: ['b1'],
} as unknown as ActorContext;

const engineRow: TransferByBranchRow = {
  itemId: 'item-1',
  sku: 'SKU-1',
  itemName: 'Item 1',
  parentSku: null,
  parentName: null,
  unit: 'Cái',
  categoryId: 'cat-1',
  categoryName: 'Nhóm A',
  brand: null,
  color: null,
  size: null,
  destinationBranchId: 'b2',
  destinationBranchName: 'CN 2',
  outQty: 5,
  outAvgPrice: 100,
  outValue: 500,
  inQty: 5,
  inAvgPrice: 100,
  inValue: 500,
};

function build(rows: TransferByBranchRow[], ownedBranch = true) {
  const engine = {
    byBranch: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(ownedBranch ? { id: 'b1' } : null),
  };
  return {
    report: new TransferByStoreReport(engine as never, branches as never),
    engine,
  };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-transfer-by-store',
  columns: ['sku', 'group', 'targetBranch', 'outQty', 'outAvgPrice', 'outValue'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('TransferByStoreReport', () => {
  it('400s when neither sourceStoreId nor actor branch is present', async () => {
    const { report } = build([]);
    await expect(report.buildData(dto, actorNoBranch)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('403s when the source store is outside the actor branch permissions', async () => {
    const { report } = build([]);
    await expect(
      report.buildData(
        { ...dto, filters: { ...dto.filters, sourceStoreId: 'b-foreign' } },
        actorWithBranch,
      ),
    ).rejects.toThrow('Access denied for stores: b-foreign');
  });

  it('defaults the source branch to the actor branch and maps group from categoryName', async () => {
    const { report, engine } = build([engineRow]);
    const result = await report.buildData(dto, actorWithBranch);
    expect(engine.byBranch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBranchId: 'b1' }),
    );
    expect(result.rows[0].group).toBe('Nhóm A');
    expect(result.rows[0].targetBranch).toBe('CN 2');
  });

  it('nulls average-price totals (non-additive)', async () => {
    const { report } = build([engineRow, { ...engineRow, outQty: 3, outValue: 300 }]);
    const result = await report.buildData(dto, actorWithBranch);
    expect(result.totals!.outQty).toBe(8);
    expect(result.totals!.outValue).toBe(800);
    expect(result.totals!.outAvgPrice).toBeNull();
  });
});
