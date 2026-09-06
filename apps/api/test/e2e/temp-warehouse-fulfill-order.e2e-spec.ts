import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  LocationType,
  StockMovementType,
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
  TempWarehouseTransferProcessingStatus,
  type TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { createTestApp, resetDatabase, seedBaseData, SeedResult } from './setup/test-app';
import { ActorContext } from '../../src/common/decorators/actor-context.decorator';
import { TempWarehouseService } from '../../src/modules/inventory/temp-warehouse/temp-warehouse.service';
import { StockLedgerService } from '../../src/modules/inventory/ledger/stock-ledger.service';
import { DeductStockStep } from '../../src/modules/pos/checkout-saga/application/steps/deduct-stock.step';
import { CheckoutContext } from '../../src/modules/pos/checkout-saga/application/checkout-step';
import { StorageEntity } from '../../src/modules/inventory/location/storage.entity';
import { ShowroomEntity } from '../../src/modules/inventory/location/showroom.entity';
import { LocationEntity } from '../../src/modules/inventory/location/location.entity';
import { ItemEntity } from '../../src/modules/inventory/location/item.entity';
import { TempWarehouseSessionEntity } from '../../src/modules/inventory/temp-warehouse/temp-warehouse-session.entity';
import { TempWarehouseLineEntity } from '../../src/modules/inventory/temp-warehouse/temp-warehouse-line.entity';

/**
 * E2E for the ledger *order* of a sale served out of the temp warehouse.
 *
 * The user-visible symptom this covers: a stock card whose running balance
 * showed -1 on the invoice row, because the sale is written inside the payment
 * transaction while the compensating warehouse->showroom transfer is written
 * afterwards by a consumer — so the transfer landed with a later `posted_at`
 * even though the goods were physically staged first.
 *
 * The sale leg is written by the real `DeductStockStep` (the checkout saga's
 * own step) rather than by hand, so the `reference_type`/`movement_type` the
 * fulfilment anchors on come from production code. The fulfilment itself is
 * invoked through `TempWarehouseService` directly — the Kafka consumer is a
 * thin wrapper, and the same shortcut is taken by
 * `temp-warehouse-fulfillment.e2e-spec.ts`.
 *
 * The central assertion is written as a running balance rather than as "row A
 * sits above row B": that is what the user actually reads off the stock card,
 * and it does not break when an unrelated movement appears between the two.
 */
describe('Temp-warehouse fulfillment ledger order (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let tempWarehouse: TempWarehouseService;
  let ledger: StockLedgerService;
  let deductStock: DeductStockStep;
  let actor: ActorContext;

  let whLocationId: string;
  let srLocationId: string;
  let sessionId: string;

  const createItem = async (code: string): Promise<string> => {
    const item = await ds.getRepository(ItemEntity).save(
      ds.getRepository(ItemEntity).create({
        organizationId: seed.organizationId,
        code,
        name: `Item ${code}`,
        unit: 'đôi',
        isActive: true,
        isPosVisible: true,
        purchasePrice: 100,
        sellingPrice: 200,
        createdBy: seed.userId,
      }),
    );
    return item.id;
  };

  /** Stock physically sitting in the main warehouse before the day starts. */
  const receiveIntoWarehouse = async (
    itemId: string,
    quantity: number,
    postedAt: Date,
  ): Promise<void> => {
    await ledger.recordBatchMovements([
      {
        itemId,
        locationId: whLocationId,
        branchId: seed.branchId,
        organizationId: seed.organizationId,
        movementType: StockMovementType.PURCHASE_RECEIPT,
        quantity,
        referenceType: 'GOODS_RECEIPT',
        referenceId: randomUUID(),
        actorContext: actor,
        unitCost: 100,
        postedAt,
      },
    ]);
  };

  const stageForShowroom = async (
    itemId: string,
    quantity: string,
  ): Promise<string> => {
    const line = await ds.getRepository(TempWarehouseLineEntity).save(
      ds.getRepository(TempWarehouseLineEntity).create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        sessionId,
        itemId,
        direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        quantity,
        status: TempWarehouseLineStatus.ACTIVE,
        sourceLocationId: whLocationId,
        createdBy: seed.userId,
      }),
    );
    return line.id;
  };

  /**
   * Runs the checkout saga's own stock-deduction step in a transaction, which
   * is the only part of checkout this feature depends on: the SALE_ISSUE rows
   * the fulfilment later anchors its position on.
   */
  const sellFromShowroom = async (
    itemId: string,
    quantity: number,
    invoiceId: string,
  ): Promise<void> => {
    const ctx = {
      actor,
      input: { invoiceId, payments: [] },
      correlationId: invoiceId,
      idempotencyKey: invoiceId,
      dryRun: false,
      invoice: { id: invoiceId, branchId: seed.branchId },
      items: [{ itemId, quantity, locationId: srLocationId }],
    } as unknown as CheckoutContext;

    await ds.transaction(async (manager) => {
      await deductStock.execute({ ...ctx, manager } as CheckoutContext);
    });
  };

  const fulfillPayload = (
    invoiceId: string,
    invoiceNumber: string,
    lines: { itemId: string; quantity: number }[],
  ): TempWarehouseInvoiceFulfillRequestedPayload => ({
    organizationId: seed.organizationId,
    branchId: seed.branchId,
    invoiceId,
    invoiceNumber,
    actor: {
      userId: seed.userId,
      organizationId: seed.organizationId,
      branchId: seed.branchId,
      roles: ['admin'],
    },
    lines,
  });

  /** Every movement of one item at one location, in stock-card order. */
  const stockCard = async (
    itemId: string,
    locationId: string,
  ): Promise<
    { movementType: string; quantity: number; referenceType: string; postedAt: Date }[]
  > => {
    const rows = await ds.query(
      `SELECT movement_type, quantity, reference_type, posted_at
         FROM stock_ledger_entries
        WHERE item_id = $1 AND location_id = $2
        ORDER BY posted_at ASC`,
      [itemId, locationId],
    );
    return rows.map((r: any) => ({
      movementType: r.movement_type,
      quantity: Number(r.quantity),
      referenceType: r.reference_type,
      postedAt: new Date(r.posted_at),
    }));
  };

  const runningBalances = (
    rows: { quantity: number }[],
  ): number[] => {
    let balance = 0;
    return rows.map((r) => (balance += r.quantity));
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    tempWarehouse = app.get(TempWarehouseService);
    ledger = app.get(StockLedgerService);
    deductStock = app.get(DeductStockStep);
    actor = {
      userId: seed.userId,
      organizationId: seed.organizationId,
      branchId: seed.branchId,
      roles: ['admin'],
    };

    const storageRepo = ds.getRepository(StorageEntity);
    const locationRepo = ds.getRepository(LocationEntity);

    const whStorage = await storageRepo.save(
      storageRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        name: 'Kho chính',
        isMainStorage: true,
        createdBy: seed.userId,
      }),
    );
    const whLocation = await locationRepo.save(
      locationRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        storageId: whStorage.id,
        code: 'WH-01',
        name: 'Kệ kho 1',
        type: LocationType.SHELF,
        isActive: true,
        isUnassigned: false,
        isDefault: true,
        createdBy: seed.userId,
      }),
    );
    whLocationId = whLocation.id;

    const srStorage = await storageRepo.save(
      storageRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        name: 'Showroom LX',
        isMainStorage: false,
        createdBy: seed.userId,
      }),
    );
    const srLocation = await locationRepo.save(
      locationRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        storageId: srStorage.id,
        code: 'SR-01',
        name: 'Kệ showroom 1',
        type: LocationType.SHELF,
        isActive: true,
        isUnassigned: false,
        isDefault: true,
        createdBy: seed.userId,
      }),
    );
    srLocationId = srLocation.id;

    await ds.getRepository(ShowroomEntity).save(
      ds.getRepository(ShowroomEntity).create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        name: 'Showroom LX',
        storageId: srStorage.id,
        isMainShowroom: true,
        createdBy: seed.userId,
      }),
    );

    const session = await ds.getRepository(TempWarehouseSessionEntity).save(
      ds.getRepository(TempWarehouseSessionEntity).create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        status: TempWarehouseSessionStatus.ACTIVE,
        direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        warehouseLocationId: whLocationId,
        showroomLocationId: srLocationId,
        openedBy: seed.userId,
        openedAt: new Date(),
        transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
        createdBy: seed.userId,
      }),
    );
    sessionId = session.id;
  }, 120000); // boot connects many Kafka consumers; allow generous startup time

  afterAll(async () => {
    if (app) await app.close();
  }, 60000);

  it('AC-04: the showroom stock card never dips below zero when a sale is served from the temp warehouse', async () => {
    const itemId = await createItem('ORDER-1');
    // Goods arrive in the warehouse well before the sale, then get staged for
    // the showroom — showroom on-hand is still 0 at the moment of the sale.
    await receiveIntoWarehouse(itemId, 1, new Date(Date.now() - 60_000));
    await stageForShowroom(itemId, '1.00');

    const invoiceId = randomUUID();
    await sellFromShowroom(itemId, 1, invoiceId);
    await tempWarehouse.fulfillInvoiceFromTempWarehouse(
      fulfillPayload(invoiceId, 'INV-ORDER-1', [{ itemId, quantity: 1 }]),
      actor,
    );

    const showroom = await stockCard(itemId, srLocationId);
    expect(showroom).toHaveLength(2);
    // The transfer in has to be read before the sale, or the balance goes negative.
    expect(showroom[0].movementType).toBe(StockMovementType.TRANSFER_IN);
    expect(showroom[1].movementType).toBe(StockMovementType.SALE_ISSUE);
    expect(runningBalances(showroom).every((b) => b >= 0)).toBe(true);
    expect(runningBalances(showroom)).toEqual([1, 0]);

    // The source side stays consistent too: received 1, shipped 1.
    const warehouse = await stockCard(itemId, whLocationId);
    expect(runningBalances(warehouse).every((b) => b >= 0)).toBe(true);
    expect(runningBalances(warehouse).at(-1)).toBe(0);

    // Backdating stays inside the sale's own business day, so no report period
    // sees stock move across its boundary.
    const sale = showroom[1].postedAt;
    const transferIn = showroom[0].postedAt;
    expect(transferIn.getTime()).toBeLessThan(sale.getTime());
    expect(sale.getTime() - transferIn.getTime()).toBeLessThanOrEqual(1);
  });

  it('AC-06: replaying the fulfilment adds no transfer and no ledger row', async () => {
    const itemId = await createItem('ORDER-REPLAY');
    await receiveIntoWarehouse(itemId, 1, new Date(Date.now() - 60_000));
    await stageForShowroom(itemId, '1.00');

    const invoiceId = randomUUID();
    await sellFromShowroom(itemId, 1, invoiceId);
    const payload = fulfillPayload(invoiceId, 'INV-ORDER-REPLAY', [
      { itemId, quantity: 1 },
    ]);

    await tempWarehouse.fulfillInvoiceFromTempWarehouse(payload, actor);
    const afterFirst = await stockCard(itemId, srLocationId);

    await tempWarehouse.fulfillInvoiceFromTempWarehouse(payload, actor); // replay

    const transfers = await ds.query(
      `SELECT id FROM stock_transfers WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(transfers).toHaveLength(1);
    // Identical rows, identical stamps — the anchor is an immutable ledger row,
    // not the consumer's clock, so a redelivery cannot produce a second answer.
    expect(await stockCard(itemId, srLocationId)).toEqual(afterFirst);
  });

  it('AC-08: a sale on a branch with no ACTIVE temp-warehouse session is untouched', async () => {
    await ds
      .getRepository(TempWarehouseSessionEntity)
      .update({ id: sessionId }, { status: TempWarehouseSessionStatus.CLOSED });

    try {
      const itemId = await createItem('ORDER-NO-SESSION');
      await receiveIntoWarehouse(itemId, 1, new Date(Date.now() - 60_000));

      const invoiceId = randomUUID();
      const before = Date.now();
      await sellFromShowroom(itemId, 1, invoiceId);
      const after = Date.now();

      await tempWarehouse.fulfillInvoiceFromTempWarehouse(
        fulfillPayload(invoiceId, 'INV-ORDER-NO-SESSION', [
          { itemId, quantity: 1 },
        ]),
        actor,
      );

      const transfers = await ds.query(
        `SELECT id FROM stock_transfers WHERE invoice_id = $1`,
        [invoiceId],
      );
      expect(transfers).toHaveLength(0);

      const showroom = await stockCard(itemId, srLocationId);
      expect(showroom).toHaveLength(1);
      expect(showroom[0].movementType).toBe(StockMovementType.SALE_ISSUE);
      // The sale keeps the write instant it has always had.
      expect(showroom[0].postedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(showroom[0].postedAt.getTime()).toBeLessThanOrEqual(after);
    } finally {
      await ds
        .getRepository(TempWarehouseSessionEntity)
        .update({ id: sessionId }, { status: TempWarehouseSessionStatus.ACTIVE });
    }
  });
});
