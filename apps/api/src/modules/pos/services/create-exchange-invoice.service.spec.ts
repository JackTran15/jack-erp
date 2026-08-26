import { EntityManager, FindOperator } from 'typeorm';
import { CreateExchangeInvoiceService } from './create-exchange-invoice.service';
import { ItemEntity } from '../../inventory/location/item.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
  LineDiscountType,
} from '../entities/invoice-item.entity';
import { computeLineDiscount } from './line-discount.util';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH = 'branch-b';
const ITEM = 'item-1';
const STORAGE_MAIN = 'storage-main'; // showroom
const STORAGE_WAREHOUSE = 'storage-warehouse';
const LOC_WAREHOUSE = 'loc-warehouse'; // FE-supplied shelf on the new line
const LOC_SHOWROOM_DEFAULT = 'loc-showroom-default';

/** Honours plain equality and `In(...)` conditions, mirroring TypeORM findBy. */
function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond instanceof FindOperator) {
      return (cond.value as unknown[]).includes(row[key]);
    }
    return row[key] === cond;
  });
}

function makeManager(opts: {
  catalog: Record<string, unknown>[];
  storages: Record<string, unknown>[];
  isl: Record<string, unknown>[];
  locations: Record<string, unknown>[];
}) {
  const findBy = jest.fn(
    async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === ItemEntity)
        return opts.catalog.filter((r) => matches(r, where));
      if (entity === StorageEntity)
        return opts.storages.filter((r) => matches(r, where));
      if (entity === ItemStorageLocationEntity)
        return opts.isl.filter((r) => matches(r, where));
      return [];
    },
  );
  const findOne = jest.fn(
    async (entity: unknown, options: { where: Record<string, unknown> }) => {
      if (entity === LocationEntity)
        return opts.locations.find((r) => matches(r, options.where)) ?? null;
      return null;
    },
  );
  // create() just echoes the constructed entity so we can assert on its fields.
  const create = jest.fn((_entity: unknown, obj: unknown) => obj);
  return { findBy, findOne, create } as unknown as EntityManager;
}

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: ORG,
  branchId: BRANCH,
  roles: [],
};

const newLine = {
  itemId: ITEM,
  locationId: LOC_WAREHOUSE, // a warehouse shelf the FE happened to send
  itemCode: 'SKU-1',
  itemName: 'Áo thun',
  unit: 'cái',
  quantity: 1,
  unitPrice: 100,
};

const returnLineWithOriginal = {
  originalInvoiceItemId: 'orig-item-1',
  itemId: ITEM,
  itemCode: 'SKU-1',
  itemName: 'Áo thun',
  unit: 'cái',
  locationId: 'loc-fe',
  quantity: 1,
  unitPrice: 100,
};

/** Same line as above minus the pointer at an original sale line (QUICK mode). */
const { originalInvoiceItemId: _drop, ...quickReturnLine } = returnLineWithOriginal;

/**
 * `create()` needs a manager that also saves. `save` echoes its argument so the
 * test can read back the entities the service constructed.
 */
function makeSavingManager() {
  const manager = makeManager({
    catalog: [{ id: ITEM, organizationId: ORG, sellingPrice: 100, purchasePrice: 60 }],
    storages: [],
    isl: [],
    locations: [],
  });
  (manager as unknown as { save: jest.Mock }).save = jest.fn(async (obj: unknown) =>
    Array.isArray(obj) ? obj : { ...(obj as Record<string, unknown>), id: 'invoice-1' },
  );
  return manager;
}

/** The IN lines are the first array-shaped `save` call (the invoice object comes first). */
function savedReturnItems(manager: EntityManager): InvoiceItemEntity[] {
  const saveCalls = (manager as unknown as { save: jest.Mock }).save.mock.calls;
  const [returnItems] = saveCalls.find(([arg]: [unknown]) => Array.isArray(arg))!;
  return returnItems as InvoiceItemEntity[];
}

describe('CreateExchangeInvoiceService.buildNewLineEntities — showroom location', () => {
  const service = new CreateExchangeInvoiceService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('resolves a new ("Mua thêm") line to the showroom default, not the FE warehouse shelf', async () => {
    const manager = makeManager({
      catalog: [
        { id: ITEM, organizationId: ORG, sellingPrice: 100, purchasePrice: 60 },
      ],
      storages: [
        { id: STORAGE_MAIN, branchId: BRANCH, organizationId: ORG, isMainStorage: true },
        { id: STORAGE_WAREHOUSE, branchId: BRANCH, organizationId: ORG, isMainStorage: false },
      ],
      // Item shelved only in the warehouse (non-main) storage.
      isl: [
        { itemId: ITEM, storageId: STORAGE_WAREHOUSE, locationId: LOC_WAREHOUSE, organizationId: ORG },
      ],
      locations: [
        { id: LOC_SHOWROOM_DEFAULT, storageId: STORAGE_MAIN, organizationId: ORG, isDefault: true },
      ],
    });

    const [entity] = (await (service as never as {
      buildNewLineEntities: (
        m: EntityManager,
        invoiceId: string,
        lines: unknown[],
        resolved: unknown[],
        a: ActorContext,
        offset: number,
      ) => Promise<InvoiceItemEntity[]>;
    }).buildNewLineEntities(
      manager,
      'inv-1',
      [newLine],
      [computeLineDiscount(newLine)],
      actor,
      0,
    )) as InvoiceItemEntity[];

    expect(entity.locationId).toBe(LOC_SHOWROOM_DEFAULT);
    expect(entity.locationId).not.toBe(LOC_WAREHOUSE);
    expect(entity.direction).toBe(ItemDirection.OUT);
  });

  it('falls back to the FE-supplied locationId when the showroom cannot be resolved', async () => {
    const manager = makeManager({
      catalog: [
        { id: ITEM, organizationId: ORG, sellingPrice: 100, purchasePrice: 60 },
      ],
      // No main storage and no default location → resolver returns nothing.
      storages: [
        { id: STORAGE_WAREHOUSE, branchId: BRANCH, organizationId: ORG, isMainStorage: false },
      ],
      isl: [],
      locations: [],
    });

    const [entity] = (await (service as never as {
      buildNewLineEntities: (
        m: EntityManager,
        invoiceId: string,
        lines: unknown[],
        resolved: unknown[],
        a: ActorContext,
        offset: number,
      ) => Promise<InvoiceItemEntity[]>;
    }).buildNewLineEntities(
      manager,
      'inv-1',
      [newLine],
      [computeLineDiscount(newLine)],
      actor,
      0,
    )) as InvoiceItemEntity[];

    expect(entity.locationId).toBe(LOC_WAREHOUSE);
  });
});

describe('CreateExchangeInvoiceService.create — REGULAR mode (originalInvoiceId given)', () => {
  it('copies the ORIGINAL sale line costPrice onto the returned leg, not 0', async () => {
    const manager = makeSavingManager();
    const dataSource = { transaction: (cb: (m: EntityManager) => unknown) => cb(manager) };
    const eligibility = {
      assertLineEligible: jest.fn(
        async () => ({ id: 'orig-item-1', costPrice: 45 }) as InvoiceItemEntity,
      ),
    };
    const itemCostSnapshot = { snapshotCosts: jest.fn() };

    const service = new CreateExchangeInvoiceService(
      {} as never,
      dataSource as never,
      eligibility as never,
      itemCostSnapshot as never,
    );

    await service.create(
      {
        originalInvoiceId: 'orig-invoice-1',
        sessionId: 'session-1',
        reason: 'Đổi hàng',
        returnLines: [returnLineWithOriginal],
        newLines: [newLine],
      } as never,
      actor,
    );

    expect(savedReturnItems(manager)[0].costPrice).toBe(45);
    expect(savedReturnItems(manager)[0].direction).toBe(ItemDirection.IN);
    expect(eligibility.assertLineEligible).toHaveBeenCalledTimes(1);
    // The current purchase price is never consulted when an original exists.
    expect(itemCostSnapshot.snapshotCosts).not.toHaveBeenCalled();
  });

  it('still rejects a returnLine with no originalInvoiceItemId', async () => {
    const manager = makeSavingManager();
    const service = new CreateExchangeInvoiceService(
      {} as never,
      { transaction: (cb: (m: EntityManager) => unknown) => cb(manager) } as never,
      { assertLineEligible: jest.fn() } as never,
      { snapshotCosts: jest.fn() } as never,
    );

    await expect(
      service.create(
        {
          originalInvoiceId: 'orig-invoice-1',
          sessionId: 'session-1',
          reason: 'Đổi hàng',
          returnLines: [quickReturnLine],
          newLines: [newLine],
        } as never,
        actor,
      ),
    ).rejects.toThrow(/originalInvoiceItemId required/);
  });
});

describe('CreateExchangeInvoiceService.create — QUICK mode (no originalInvoiceId)', () => {
  function makeQuickService(snapshot: Map<string, number>) {
    const manager = makeSavingManager();
    const eligibility = { assertLineEligible: jest.fn() };
    const itemCostSnapshot = { snapshotCosts: jest.fn(async () => snapshot) };
    const service = new CreateExchangeInvoiceService(
      {} as never,
      { transaction: (cb: (m: EntityManager) => unknown) => cb(manager) } as never,
      eligibility as never,
      itemCostSnapshot as never,
    );
    return { service, manager, eligibility, itemCostSnapshot };
  }

  const quickDto = {
    sessionId: 'session-1',
    reason: 'Đổi trả nhanh',
    returnLines: [quickReturnLine],
    newLines: [newLine],
  };

  it('creates an EXCHANGE draft with a null originalInvoiceId and IN/OUT lines', async () => {
    const { service, manager } = makeQuickService(new Map([[ITEM, 60]]));

    await service.create(quickDto as never, actor);

    const saveCalls = (manager as unknown as { save: jest.Mock }).save.mock.calls;
    const [invoice] = saveCalls.find(([arg]: [unknown]) => !Array.isArray(arg))!;
    expect((invoice as Record<string, unknown>).type).toBe('EXCHANGE');
    expect((invoice as Record<string, unknown>).originalInvoiceId).toBeUndefined();

    const arrays = saveCalls.filter(([arg]: [unknown]) => Array.isArray(arg));
    expect((arrays[0][0] as InvoiceItemEntity[])[0].direction).toBe(ItemDirection.IN);
    expect((arrays[1][0] as InvoiceItemEntity[])[0].direction).toBe(ItemDirection.OUT);
  });

  it('takes the returned line costPrice from the current purchase price, not 0', async () => {
    const { service, manager, itemCostSnapshot } = makeQuickService(
      new Map([[ITEM, 60]]),
    );

    await service.create(quickDto as never, actor);

    expect(itemCostSnapshot.snapshotCosts).toHaveBeenCalledWith(ORG, [ITEM]);
    expect(savedReturnItems(manager)[0].costPrice).toBe(60);
  });

  it('never calls the eligibility check — there is no original document to check', async () => {
    const { service, eligibility } = makeQuickService(new Map([[ITEM, 60]]));

    await service.create(quickDto as never, actor);

    expect(eligibility.assertLineEligible).not.toHaveBeenCalled();
  });

  it('rejects a returnLine that points at an original sale line', async () => {
    const { service } = makeQuickService(new Map([[ITEM, 60]]));

    await expect(
      service.create(
        { ...quickDto, returnLines: [returnLineWithOriginal] } as never,
        actor,
      ),
    ).rejects.toThrow(/originalInvoiceItemId is not allowed/);
  });

  it('keeps the existing guards on empty line sets', async () => {
    const { service } = makeQuickService(new Map([[ITEM, 60]]));

    await expect(
      service.create({ ...quickDto, returnLines: [] } as never, actor),
    ).rejects.toThrow(/at least one returnLine/);
    await expect(
      service.create({ ...quickDto, newLines: [] } as never, actor),
    ).rejects.toThrow(/at least one newLine/);
  });
});

describe('CreateExchangeInvoiceService.create — per-line discounts', () => {
  /** The exact cart from the production report: 685.000 − 30% out, 460.000 in. */
  const discountedNewLine = {
    ...newLine,
    unitPrice: 685000,
    lineDiscountType: LineDiscountType.PERCENT,
    lineDiscountValue: 30,
    lineDiscountReason: 'sale30',
  };
  const plainReturnLine = { ...quickReturnLine, unitPrice: 460000 };

  function makeQuick() {
    const manager = makeSavingManager();
    const service = new CreateExchangeInvoiceService(
      {} as never,
      { transaction: (cb: (m: EntityManager) => unknown) => cb(manager) } as never,
      { assertLineEligible: jest.fn() } as never,
      { snapshotCosts: jest.fn(async () => new Map([[ITEM, 60]])) } as never,
    );
    return { service, manager };
  }

  function savedInvoice(manager: EntityManager): Record<string, unknown> {
    const saveCalls = (manager as unknown as { save: jest.Mock }).save.mock.calls;
    const [invoice] = saveCalls.find(([arg]: [unknown]) => !Array.isArray(arg))!;
    return invoice as Record<string, unknown>;
  }

  function savedNewItems(manager: EntityManager): InvoiceItemEntity[] {
    const saveCalls = (manager as unknown as { save: jest.Mock }).save.mock.calls;
    const arrays = saveCalls.filter(([arg]: [unknown]) => Array.isArray(arg));
    return arrays[1][0] as InvoiceItemEntity[];
  }

  it('nets the OUT line discount off netAmount instead of charging it to the customer', async () => {
    const { service, manager } = makeQuick();

    await service.create(
      {
        sessionId: 'session-1',
        reason: 'Đổi trả nhanh',
        returnLines: [plainReturnLine],
        newLines: [discountedNewLine],
      } as never,
      actor,
    );

    const invoice = savedInvoice(manager);
    // 685.000 − 205.500 = 479.500 sold, 460.000 returned → the customer owes 19.500,
    // which is what POS displayed. Before this fix the draft said 225.000.
    expect(invoice.subtotal).toBe(479500);
    expect(invoice.netAmount).toBe(19500);
    expect(invoice.amountDue).toBe(19500);
    expect(invoice.refundedAmount).toBe(0);
  });

  it('persists the discount breakdown on the OUT line', async () => {
    const { service, manager } = makeQuick();

    await service.create(
      {
        sessionId: 'session-1',
        reason: 'Đổi trả nhanh',
        returnLines: [plainReturnLine],
        newLines: [discountedNewLine],
      } as never,
      actor,
    );

    expect(savedNewItems(manager)[0]).toMatchObject({
      lineDiscount: 205500,
      lineDiscountType: LineDiscountType.PERCENT,
      lineDiscountValue: 30,
      lineDiscountReason: 'sale30',
      lineTotal: 479500,
    });
  });

  it('applies a discount sitting on the returned (IN) line too', async () => {
    const { service, manager } = makeQuick();

    await service.create(
      {
        sessionId: 'session-1',
        reason: 'Đổi trả nhanh',
        returnLines: [
          {
            ...quickReturnLine,
            unitPrice: 500000,
            lineDiscountType: LineDiscountType.PERCENT,
            lineDiscountValue: 10,
            lineDiscountReason: 'sale10',
          },
        ],
        newLines: [{ ...newLine, unitPrice: 600000 }],
      } as never,
      actor,
    );

    expect(savedReturnItems(manager)[0]).toMatchObject({
      lineDiscount: 50000,
      lineDiscountType: LineDiscountType.PERCENT,
      lineDiscountValue: 10,
      lineTotal: 450000,
    });
    // 600.000 − 450.000
    expect(savedInvoice(manager).netAmount).toBe(150000);
  });

  it('refunds on the discounted values when the returned leg is worth more', async () => {
    const { service, manager } = makeQuick();

    await service.create(
      {
        sessionId: 'session-1',
        reason: 'Đổi trả nhanh',
        returnLines: [{ ...quickReturnLine, unitPrice: 600000 }],
        newLines: [discountedNewLine],
      } as never,
      actor,
    );

    const invoice = savedInvoice(manager);
    // 479.500 sold − 600.000 returned
    expect(invoice.netAmount).toBe(-120500);
    expect(invoice.refundedAmount).toBe(120500);
    expect(invoice.amountDue).toBe(0);
  });

  it('ignores a client-supplied lineDiscount amount when a type is present', async () => {
    const { service, manager } = makeQuick();

    await service.create(
      {
        sessionId: 'session-1',
        reason: 'Đổi trả nhanh',
        returnLines: [plainReturnLine],
        // A stale client posting both: the type wins, the amount is discarded.
        newLines: [{ ...discountedNewLine, lineDiscount: 0 }],
      } as never,
      actor,
    );

    expect(savedNewItems(manager)[0].lineTotal).toBe(479500);
    expect(savedInvoice(manager).netAmount).toBe(19500);
  });
});
