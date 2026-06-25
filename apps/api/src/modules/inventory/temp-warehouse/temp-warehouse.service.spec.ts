import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
  type TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { TempWarehouseService } from './temp-warehouse.service';
import { TempWarehouseLineEntity } from './temp-warehouse-line.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH = 'branch-1';
const SESSION = 'session-1';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: ORG,
  branchId: BRANCH,
  roles: [],
};

const session = {
  id: SESSION,
  organizationId: ORG,
  branchId: BRANCH,
  status: TempWarehouseSessionStatus.ACTIVE,
  warehouseLocationId: 'wh-loc',
  showroomLocationId: 'sr-loc',
};

let lineSeq = 0;
const line = (
  overrides: Partial<TempWarehouseLineEntity>,
): TempWarehouseLineEntity =>
  ({
    id: `line-${++lineSeq}`,
    organizationId: ORG,
    branchId: BRANCH,
    sessionId: SESSION,
    itemId: 'item-1',
    direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    quantity: '5.00',
    status: TempWarehouseLineStatus.ACTIVE,
    sourceLocationId: 'shelf-a',
    carrierUserId: null,
    notes: null,
    createdAt: new Date(),
    ...overrides,
  }) as TempWarehouseLineEntity;

const payload = (
  lines: { itemId: string; quantity: number }[],
): TempWarehouseInvoiceFulfillRequestedPayload => ({
  organizationId: ORG,
  branchId: BRANCH,
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-001',
  actor: { userId: 'user-1', organizationId: ORG, branchId: BRANCH, roles: [] },
  lines,
});

describe('TempWarehouseService.fulfillInvoiceFromTempWarehouse', () => {
  let service: TempWarehouseService;
  let sessionRepo: { findOne: jest.Mock };
  let lineRepo: { findOne: jest.Mock; find: jest.Mock };
  let stockTransferService: { createAndPost: jest.Mock };
  let materializer: { buildBranchScopedTransfer: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let createdInput: any;

  const build = (activeByItem: Record<string, TempWarehouseLineEntity[]>) => {
    const byId: Record<string, TempWarehouseLineEntity> = {};
    for (const arr of Object.values(activeByItem)) {
      for (const l of arr) byId[l.id] = l;
    }

    sessionRepo = { findOne: jest.fn().mockResolvedValue(session) };
    lineRepo = {
      findOne: jest.fn().mockResolvedValue(null), // defensive guard: not fulfilled yet
      find: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(activeByItem[where.itemId] ?? []),
        ),
    };
    materializer = {
      buildBranchScopedTransfer: jest.fn().mockImplementation((p) => {
        createdInput = {
          notes: p.notes,
          lines: p.lines.map((l: any) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            sourceStorageId: 'wh-storage',
            destinationStorageId: 'sr-storage',
            sourceLocationId: l.sourceLocationId ?? 'shelf-a',
            destinationLocationId: 'sr-shelf',
          })),
        };
        return Promise.resolve(createdInput);
      }),
    };
    stockTransferService = {
      createAndPost: jest.fn().mockResolvedValue({ id: 'transfer-1' }),
    };
    let createCounter = 0;
    manager = {
      findOne: jest.fn().mockImplementation((_e, { where }) => {
        const l = byId[where.id];
        return Promise.resolve(
          l && l.status === TempWarehouseLineStatus.ACTIVE ? { ...l } : null,
        );
      }),
      create: jest
        .fn()
        .mockImplementation((_e, data) => ({ id: `rem-${++createCounter}`, ...data })),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    };

    service = new TempWarehouseService(
      sessionRepo as any,
      lineRepo as any,
      {} as any, // stockBalanceRepo
      {} as any, // userRepo
      {} as any, // userBranchRepo
      {} as any, // itemRepo
      {} as any, // locationRepo
      dataSource as any,
      {} as any, // locationResolver
      {} as any, // eventPublisher
      stockTransferService as any,
      materializer as any,
    );
  };

  it('no-ops when there is no ACTIVE session', async () => {
    build({ 'item-1': [line({ quantity: '5.00' })] });
    sessionRepo.findOne.mockResolvedValue(null);

    await service.fulfillInvoiceFromTempWarehouse(
      payload([{ itemId: 'item-1', quantity: 2 }]),
      actor,
    );

    expect(stockTransferService.createAndPost).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('no-ops when the invoice already consumed staged stock (replay)', async () => {
    build({ 'item-1': [line({ quantity: '5.00' })] });
    lineRepo.findOne.mockResolvedValue({ id: 'line-existing' });

    await service.fulfillInvoiceFromTempWarehouse(
      payload([{ itemId: 'item-1', quantity: 2 }]),
      actor,
    );

    expect(stockTransferService.createAndPost).not.toHaveBeenCalled();
  });

  it('no-ops when the item has no ACTIVE warehouse_to_showroom line', async () => {
    build({}); // no staged lines for item-1
    await service.fulfillInvoiceFromTempWarehouse(
      payload([{ itemId: 'item-1', quantity: 2 }]),
      actor,
    );
    expect(stockTransferService.createAndPost).not.toHaveBeenCalled();
  });

  it('splits a partially consumed line: transfers saleQty, keeps the remainder ACTIVE', async () => {
    const staged = line({ id: 'L1', quantity: '5.00' });
    build({ 'item-1': [staged] });

    await service.fulfillInvoiceFromTempWarehouse(
      payload([{ itemId: 'item-1', quantity: 2 }]),
      actor,
    );

    // One transfer line for the item with qty = min(saleQty, tempQty) = 2.
    expect(stockTransferService.createAndPost).toHaveBeenCalledTimes(1);
    expect(createdInput.lines).toEqual([
      expect.objectContaining({ itemId: 'item-1', quantity: 2 }),
    ]);
    expect(createdInput.invoiceId).toBe('inv-1');
    expect(createdInput.invoiceNumber).toBe('INV-001');
    expect(createdInput.notes).toContain('INV-001');

    // Remainder (3) created as a fresh ACTIVE line.
    expect(manager.create).toHaveBeenCalledWith(
      TempWarehouseLineEntity,
      expect.objectContaining({
        itemId: 'item-1',
        quantity: '3.00',
        status: TempWarehouseLineStatus.ACTIVE,
      }),
    );
    // Consumed portion flips to TRANSFERRED with invoice + transfer links + remainder pointer.
    expect(manager.update).toHaveBeenCalledWith(
      TempWarehouseLineEntity,
      'L1',
      expect.objectContaining({
        status: TempWarehouseLineStatus.TRANSFERRED,
        quantity: '2.00',
        transferId: 'transfer-1',
        invoiceId: 'inv-1',
        invoiceNumber: 'INV-001',
        supersededById: 'rem-1',
      }),
    );
  });

  it('fully consumes when tempQty < saleQty: transfers tempQty, no remainder', async () => {
    const staged = line({ id: 'L1', quantity: '1.00' });
    build({ 'item-1': [staged] });

    await service.fulfillInvoiceFromTempWarehouse(
      payload([{ itemId: 'item-1', quantity: 3 }]),
      actor,
    );

    expect(createdInput.lines).toEqual([
      expect.objectContaining({ itemId: 'item-1', quantity: 1 }),
    ]);
    expect(manager.create).not.toHaveBeenCalled(); // no remainder
    expect(manager.update).toHaveBeenCalledWith(
      TempWarehouseLineEntity,
      'L1',
      expect.objectContaining({
        status: TempWarehouseLineStatus.TRANSFERRED,
        quantity: '1.00',
        transferId: 'transfer-1',
      }),
    );
    expect(manager.update).toHaveBeenCalledTimes(1);
  });

  it('matches multiple staged lines FIFO and aggregates into one transfer line', async () => {
    const older = line({ id: 'A', quantity: '2.00', createdAt: new Date('2026-01-01') });
    const newer = line({ id: 'B', quantity: '3.00', createdAt: new Date('2026-02-01') });
    // service orders by createdAt ASC; provide already-ordered to mirror the query.
    build({ 'item-1': [older, newer] });

    await service.fulfillInvoiceFromTempWarehouse(
      payload([{ itemId: 'item-1', quantity: 4 }]),
      actor,
    );

    // Aggregated to a single transfer line of qty 4.
    expect(createdInput.lines).toEqual([
      expect.objectContaining({ itemId: 'item-1', quantity: 4 }),
    ]);
    // A fully consumed (2, no remainder); B partially consumed (2, remainder 1).
    expect(manager.update).toHaveBeenCalledWith(
      TempWarehouseLineEntity,
      'A',
      expect.objectContaining({
        status: TempWarehouseLineStatus.TRANSFERRED,
        quantity: '2.00',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      TempWarehouseLineEntity,
      expect.objectContaining({ quantity: '1.00' }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      TempWarehouseLineEntity,
      'B',
      expect.objectContaining({
        status: TempWarehouseLineStatus.TRANSFERRED,
        quantity: '2.00',
        supersededById: 'rem-1',
      }),
    );
  });
});

describe('TempWarehouseService.listLines (includeTransferred)', () => {
  let service: TempWarehouseService;
  let clauses: string[];

  const setup = () => {
    clauses = [];
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn(function (clause: string) {
        clauses.push(clause);
        return qb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const sessionRepo = { findOne: jest.fn().mockResolvedValue(session) };
    const lineRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    service = new TempWarehouseService(
      sessionRepo as any,
      lineRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };

  it('defaults to the ACTIVE working set and excludes TRANSFERRED', async () => {
    setup();
    await service.listLines({ branchId: BRANCH } as any, actor);
    expect(clauses.some((c) => c.includes('l.status != :transferred'))).toBe(true);
    expect(clauses.some((c) => c.includes('l.status = :active'))).toBe(true);
    expect(clauses.some((c) => c.includes('invoice_id IS NOT NULL'))).toBe(false);
  });

  it('includeTransferred surfaces ACTIVE + sale-consumed (invoice_id NOT NULL) rows only', async () => {
    setup();
    await service.listLines(
      { branchId: BRANCH, includeTransferred: true } as any,
      actor,
    );
    expect(
      clauses.some(
        (c) =>
          c.includes('l.status = :active') &&
          c.includes('l.status = :transferred') &&
          c.includes('l.invoice_id IS NOT NULL'),
      ),
    ).toBe(true);
    // never an unconditional exclusion of TRANSFERRED in this mode.
    expect(clauses.some((c) => c === 'l.status != :transferred')).toBe(false);
  });
});
