import {
  TempWarehouseCloseMode,
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
  TempWarehouseTransferProcessingStatus,
  type TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { TempWarehouseService } from './temp-warehouse.service';
import { TempWarehouseLineEntity } from './temp-warehouse-line.entity';
import { TempWarehouseSessionEntity } from './temp-warehouse-session.entity';
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
      {} as any, // userRepo
      {} as any, // userBranchRepo
      {} as any, // itemRepo
      {} as any, // locationRepo
      dataSource as any,
      {} as any, // locationResolver
      {} as any, // storageDefaultLocationResolver
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
    await service.listLines(
      {
        branchId: BRANCH,
        direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
      } as any,
      actor,
    );
    expect(clauses.some((c) => c.includes('l.status != :transferred'))).toBe(true);
    expect(clauses.some((c) => c.includes('l.status = :active'))).toBe(true);
    expect(clauses.some((c) => c.includes('invoice_id IS NOT NULL'))).toBe(false);
  });

  it('includeTransferred surfaces ACTIVE + sale-consumed (invoice_id NOT NULL) rows only', async () => {
    setup();
    await service.listLines(
      {
        branchId: BRANCH,
        direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        includeTransferred: true,
      } as any,
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

describe('TempWarehouseService.closeBranchSessions', () => {
  const W2S = TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
  const S2W = TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE;

  const sess = (
    overrides: Partial<TempWarehouseSessionEntity>,
  ): TempWarehouseSessionEntity =>
    ({
      id: 'sess',
      organizationId: ORG,
      branchId: BRANCH,
      status: TempWarehouseSessionStatus.ACTIVE,
      direction: W2S,
      closeMode: null,
      warehouseLocationId: 'wh-loc',
      showroomLocationId: 'sr-loc',
      transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
      closedAt: null,
      ...overrides,
    }) as TempWarehouseSessionEntity;

  /** Build a service whose tx manager serves the given sessions + per-session ACTIVE lines. */
  const build = (
    sessions: TempWarehouseSessionEntity[],
    linesBySession: Record<string, TempWarehouseLineEntity[]> = {},
  ) => {
    const saved: any[] = [];
    const updates: Array<{ id: string; patch: any }> = [];
    const manager = {
      find: jest.fn().mockImplementation((entity: any, opts: any) => {
        const where = opts?.where ?? {};
        if (entity === TempWarehouseSessionEntity) {
          // Branch-level load vs refreshed-by-id load.
          return Promise.resolve(where.branchId ? sessions : sessions);
        }
        // TempWarehouseLineEntity
        if (where.status === TempWarehouseLineStatus.AUTO_BALANCED) {
          return Promise.resolve([]); // no existing auto-balanced lines
        }
        if (where.status === TempWarehouseLineStatus.ACTIVE) {
          return Promise.resolve(linesBySession[where.sessionId] ?? []);
        }
        return Promise.resolve([]);
      }),
      create: jest.fn().mockImplementation((_e: any, data: any) => data),
      save: jest.fn().mockImplementation((e: any) => {
        saved.push(e);
        return Promise.resolve({ id: `auto-${saved.length}`, ...e });
      }),
      update: jest
        .fn()
        .mockImplementation((_e: any, id: string, patch: any) => {
          updates.push({ id, patch });
          return Promise.resolve({ affected: 1 });
        }),
    };
    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    };
    const eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const sessionRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };

    const service = new TempWarehouseService(
      sessionRepo as any,
      {} as any, // lineRepo
      {} as any, // userRepo
      {} as any, // userBranchRepo
      {} as any, // itemRepo
      {} as any, // locationRepo
      dataSource as any,
      {} as any, // locationResolver
      {} as any, // storageDefaultLocationResolver
      eventPublisher as any,
      {} as any, // stockTransferService
      {} as any, // transferMaterializer
    );
    return { service, manager, saved, updates, eventPublisher };
  };

  it('NET_OFFSET nets across both sessions when locations match', async () => {
    const w2s = sess({ id: 'w', direction: W2S });
    const s2w = sess({ id: 's', direction: S2W });
    const { service, saved, updates, eventPublisher } = build([w2s, s2w], {
      w: [line({ sessionId: 'w', direction: W2S, quantity: '5.00' })],
      s: [line({ sessionId: 's', direction: S2W, quantity: '2.00' })],
    });

    const result = await service.closeBranchSessions(
      { branchId: BRANCH, mode: TempWarehouseCloseMode.NET_OFFSET },
      actor,
    );

    expect(result.netOffsetEligible).toBe(true);
    // net surplus 3 w2s → one compensating s2w line attached to the s2w session.
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      sessionId: 's',
      direction: S2W,
      quantity: '3.00',
      status: TempWarehouseLineStatus.AUTO_BALANCED,
    });
    // both sessions closed with processing NONE, no events.
    expect(updates).toHaveLength(2);
    expect(
      updates.every(
        (u) =>
          u.patch.status === TempWarehouseSessionStatus.CLOSED &&
          u.patch.closeMode === TempWarehouseCloseMode.NET_OFFSET &&
          u.patch.transferProcessingStatus ===
            TempWarehouseTransferProcessingStatus.NONE,
      ),
    ).toBe(true);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('rejects NET_OFFSET when the two sessions have different locations', async () => {
    const w2s = sess({ id: 'w', direction: W2S, warehouseLocationId: 'wh-A' });
    const s2w = sess({ id: 's', direction: S2W, warehouseLocationId: 'wh-B' });
    const { service } = build([w2s, s2w]);

    await expect(
      service.closeBranchSessions(
        { branchId: BRANCH, mode: TempWarehouseCloseMode.NET_OFFSET },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'TEMP_WAREHOUSE_NET_OFFSET_NOT_ELIGIBLE' },
    });
  });

  it('CREATE_TRANSFERS publishes one event per session (different locations → single each)', async () => {
    const w2s = sess({ id: 'w', direction: W2S, warehouseLocationId: 'wh-A' });
    const s2w = sess({ id: 's', direction: S2W, warehouseLocationId: 'wh-B' });
    const { service, updates, eventPublisher } = build([w2s, s2w], {
      w: [line({ sessionId: 'w', direction: W2S })],
      s: [line({ sessionId: 's', direction: S2W })],
    });

    const result = await service.closeBranchSessions(
      { branchId: BRANCH, mode: TempWarehouseCloseMode.CREATE_TRANSFERS },
      actor,
    );

    expect(result.netOffsetEligible).toBe(false);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    expect(
      updates.every(
        (u) =>
          u.patch.transferProcessingStatus ===
          TempWarehouseTransferProcessingStatus.PENDING,
      ),
    ).toBe(true);
  });

  it('CREATE_TRANSFERS with a single session publishes once', async () => {
    const w2s = sess({ id: 'w', direction: W2S });
    const { service, eventPublisher } = build([w2s], {
      w: [line({ sessionId: 'w', direction: W2S })],
    });

    await service.closeBranchSessions(
      { branchId: BRANCH, mode: TempWarehouseCloseMode.CREATE_TRANSFERS },
      actor,
    );

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects NET_OFFSET when only one session is active', async () => {
    const w2s = sess({ id: 'w', direction: W2S });
    const { service } = build([w2s]);

    await expect(
      service.closeBranchSessions(
        { branchId: BRANCH, mode: TempWarehouseCloseMode.NET_OFFSET },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'TEMP_WAREHOUSE_NET_OFFSET_NOT_ELIGIBLE' },
    });
  });

  it('replays when sessions are already CLOSED with the same mode', async () => {
    const closed = sess({
      id: 'w',
      direction: W2S,
      status: TempWarehouseSessionStatus.CLOSED,
      closeMode: TempWarehouseCloseMode.NONE,
      closedAt: new Date(),
    });
    const { service, eventPublisher } = build([closed]);

    const result = await service.closeBranchSessions(
      { branchId: BRANCH, mode: TempWarehouseCloseMode.NONE },
      actor,
    );

    expect(result.sessions).toHaveLength(1);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('409s when re-closing with a different mode', async () => {
    const closed = sess({
      id: 'w',
      direction: W2S,
      status: TempWarehouseSessionStatus.CLOSED,
      closeMode: TempWarehouseCloseMode.NONE,
      closedAt: new Date(),
    });
    const { service } = build([closed]);

    await expect(
      service.closeBranchSessions(
        { branchId: BRANCH, mode: TempWarehouseCloseMode.CREATE_TRANSFERS },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'TEMP_WAREHOUSE_SESSION_ALREADY_CLOSED_DIFFERENT_MODE' },
    });
  });

  it('404s when the branch has no session at all', async () => {
    const { service } = build([]);

    await expect(
      service.closeBranchSessions(
        { branchId: BRANCH, mode: TempWarehouseCloseMode.NONE },
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'TEMP_WAREHOUSE_NO_ACTIVE_SESSION' },
    });
  });
});

describe('TempWarehouseService.addLine (session locations)', () => {
  const W2S = TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;

  const buildAddLine = (opts: {
    resolveStorage?: jest.Mock;
    resolveBranch?: jest.Mock;
  }) => {
    const created: any[] = [];
    const manager = {
      findOne: jest.fn().mockResolvedValue(null), // no existing session
      create: jest.fn().mockImplementation((_e: any, data: any) => data),
      save: jest.fn().mockImplementation((e: any) => {
        created.push(e);
        return Promise.resolve({ id: `saved-${created.length}`, ...e });
      }),
    };
    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    };
    const storageDefaultLocationResolver = {
      resolveStorageTransferLocation: opts.resolveStorage ?? jest.fn(),
    };
    const locationResolver = { resolve: opts.resolveBranch ?? jest.fn() };

    const service = new TempWarehouseService(
      {} as any, // sessionRepo
      {} as any, // lineRepo
      {} as any, // userRepo
      {} as any, // userBranchRepo
      {} as any, // itemRepo
      {} as any, // locationRepo
      dataSource as any,
      locationResolver as any,
      storageDefaultLocationResolver as any,
      {} as any, // eventPublisher
      {} as any, // stockTransferService
      {} as any, // transferMaterializer
    );
    return { service, created, storageDefaultLocationResolver, locationResolver };
  };

  it('resolves picked storages to distinct session locations', async () => {
    const resolveStorage = jest
      .fn()
      .mockResolvedValueOnce('wh-loc')
      .mockResolvedValueOnce('sr-loc');
    const { service, created, locationResolver } = buildAddLine({
      resolveStorage,
    });

    const res = await service.addLine(
      {
        branchId: BRANCH,
        itemId: 'item-1',
        direction: W2S,
        warehouseStorageId: 'wh-st',
        showroomStorageId: 'sr-st',
      } as any,
      actor,
    );

    expect(locationResolver.resolve).not.toHaveBeenCalled();
    const session = created.find((c) => c.warehouseLocationId);
    expect(session).toMatchObject({
      warehouseLocationId: 'wh-loc',
      showroomLocationId: 'sr-loc',
      direction: W2S,
    });
    expect(res.line.direction).toBe(W2S);
  });

  it('rejects when both storages resolve to the same location', async () => {
    const resolveStorage = jest.fn().mockResolvedValue('same-loc');
    const { service } = buildAddLine({ resolveStorage });

    await expect(
      service.addLine(
        {
          branchId: BRANCH,
          itemId: 'item-1',
          direction: W2S,
          warehouseStorageId: 'wh-st',
          showroomStorageId: 'sr-st',
        } as any,
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'TEMP_WAREHOUSE_SESSION_SAME_LOCATION' },
    });
  });

  it('falls back to the branch resolver when storages are omitted', async () => {
    const resolveStorage = jest.fn();
    const resolveBranch = jest.fn().mockResolvedValue({
      warehouseLocationId: 'wh-b',
      showroomLocationId: 'sr-b',
    });
    const { service, created } = buildAddLine({ resolveStorage, resolveBranch });

    await service.addLine(
      { branchId: BRANCH, itemId: 'item-1', direction: W2S } as any,
      actor,
    );

    expect(resolveStorage).not.toHaveBeenCalled();
    expect(resolveBranch).toHaveBeenCalled();
    const session = created.find((c) => c.warehouseLocationId);
    expect(session).toMatchObject({
      warehouseLocationId: 'wh-b',
      showroomLocationId: 'sr-b',
    });
  });
});
