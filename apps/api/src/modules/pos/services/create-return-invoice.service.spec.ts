import { CreateReturnInvoiceService } from './create-return-invoice.service';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { ReturnInvoiceMode } from '../dto/create-return-invoice.dto';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH = 'branch-b';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: ORG,
  branchId: BRANCH,
  roles: [],
};

/** Manager stub: no storages in-branch, so resolveBranchItemLocations short-circuits to an empty map. */
function makeManager() {
  const findBy = jest.fn(async () => []);
  const findOne = jest.fn(async () => null);
  const create = jest.fn((_entity: unknown, obj: unknown) => obj);
  const save = jest.fn(async (obj: unknown) =>
    Array.isArray(obj) ? obj : { ...(obj as Record<string, unknown>), id: 'invoice-1' },
  );
  return { findBy, findOne, create, save };
}

const baseLine = {
  itemId: 'item-1',
  itemCode: 'SKU-1',
  itemName: 'Áo thun',
  unit: 'cái',
  locationId: 'loc-fe',
  quantity: 2,
  unitPrice: 100,
};

describe('CreateReturnInvoiceService — costPrice on the returned (IN) line', () => {
  it('REGULAR mode: copies the ORIGINAL sale line costPrice, not 0', async () => {
    const manager = makeManager();
    const dataSource = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
    const eligibility = {
      assertLineEligible: jest.fn(
        async () => ({ id: 'orig-item-1', costPrice: 45 }) as InvoiceItemEntity,
      ),
    };
    const itemCostSnapshot = { snapshotCosts: jest.fn() };

    const service = new CreateReturnInvoiceService(
      {} as never,
      dataSource as never,
      eligibility as never,
      itemCostSnapshot as never,
    );

    await service.create(
      {
        mode: ReturnInvoiceMode.REGULAR,
        originalInvoiceId: 'orig-invoice-1',
        sessionId: 'session-1',
        reason: 'Đổi ý',
        lines: [{ ...baseLine, originalInvoiceItemId: 'orig-item-1' }],
      },
      actor,
    );

    expect(itemCostSnapshot.snapshotCosts).not.toHaveBeenCalled();
    const [createdItems] = manager.save.mock.calls.find(([arg]) => Array.isArray(arg))!;
    expect((createdItems as InvoiceItemEntity[])[0].costPrice).toBe(45);
  });

  it('QUICK mode: falls back to the item current cost snapshot, not 0', async () => {
    const manager = makeManager();
    const dataSource = { transaction: (cb: (m: unknown) => unknown) => cb(manager) };
    const eligibility = { assertLineEligible: jest.fn() };
    const itemCostSnapshot = {
      snapshotCosts: jest.fn(async () => new Map([['item-1', 30]])),
    };

    const service = new CreateReturnInvoiceService(
      {} as never,
      dataSource as never,
      eligibility as never,
      itemCostSnapshot as never,
    );

    await service.create(
      {
        mode: ReturnInvoiceMode.QUICK,
        sessionId: 'session-1',
        reason: 'Đổi ý',
        lines: [baseLine],
      },
      actor,
    );

    expect(eligibility.assertLineEligible).not.toHaveBeenCalled();
    const [createdItems] = manager.save.mock.calls.find(([arg]) => Array.isArray(arg))!;
    expect((createdItems as InvoiceItemEntity[])[0].costPrice).toBe(30);
  });
});
