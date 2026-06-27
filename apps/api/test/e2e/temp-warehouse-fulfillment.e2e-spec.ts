import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  LocationType,
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
  TempWarehouseTransferProcessingStatus,
  type TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { createTestApp, resetDatabase, seedBaseData, SeedResult } from './setup/test-app';
import { ActorContext } from '../../src/common/decorators/actor-context.decorator';
import { TempWarehouseService } from '../../src/modules/inventory/temp-warehouse/temp-warehouse.service';
import { StorageEntity } from '../../src/modules/inventory/location/storage.entity';
import { ShowroomEntity } from '../../src/modules/inventory/location/showroom.entity';
import { LocationEntity } from '../../src/modules/inventory/location/location.entity';
import { ItemEntity } from '../../src/modules/inventory/location/item.entity';
import { TempWarehouseSessionEntity } from '../../src/modules/inventory/temp-warehouse/temp-warehouse-session.entity';
import { TempWarehouseLineEntity } from '../../src/modules/inventory/temp-warehouse/temp-warehouse-line.entity';

/**
 * E2E for the checkout -> temp-warehouse fulfillment flow (EPIC-25062026).
 * Calls TempWarehouseService.fulfillInvoiceFromTempWarehouse directly (the
 * consumer is a thin wrapper) against the erp_test DB and asserts the posted
 * transfer, the split/consumed lines, and the ledger movement.
 */
describe('Temp-warehouse checkout fulfillment (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let service: TempWarehouseService;
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
        unit: 'cái',
        isActive: true,
        isPosVisible: true,
        purchasePrice: 100,
        sellingPrice: 200,
        createdBy: seed.userId,
      }),
    );
    return item.id;
  };

  const addW2sLine = async (
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
        createdBy: seed.userId,
      }),
    );
    return line.id;
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

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    service = app.get(TempWarehouseService);
    actor = {
      userId: seed.userId,
      organizationId: seed.organizationId,
      branchId: seed.branchId,
      roles: ['admin'],
    };

    const storageRepo = ds.getRepository(StorageEntity);
    const locationRepo = ds.getRepository(LocationEntity);

    // Main warehouse storage + default shelf.
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

    // Showroom storage + default shelf + showroom record.
    const srStorage = await storageRepo.save(
      storageRepo.create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        name: 'Kho trưng bày',
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
        name: 'Showroom chính',
        storageId: srStorage.id,
        isMainShowroom: true,
        createdBy: seed.userId,
      }),
    );

    // One ACTIVE w2s temp-warehouse session for the branch (checkout fulfillment
    // consumes warehouse_to_showroom staged stock, so it targets the w2s session).
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

  it('splits a partially consumed line and posts a warehouse->showroom transfer', async () => {
    const itemId = await createItem('SPLIT-1');
    await addW2sLine(itemId, '5.00');

    const invoiceId = randomUUID();
    await service.fulfillInvoiceFromTempWarehouse(
      fulfillPayload(invoiceId, 'INV-SPLIT-1', [{ itemId, quantity: 2 }]),
      actor,
    );

    // 1 posted transfer tied to the invoice, with the business description.
    const transfers = await ds.query(
      `SELECT id, status, invoice_number, source_branch_id, destination_branch_id, notes
         FROM stock_transfers WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0].status).toBe('POSTED');
    expect(transfers[0].invoice_number).toBe('INV-SPLIT-1');
    expect(transfers[0].notes).toContain('INV-SPLIT-1');
    const transferId = transfers[0].id;

    // Transfer line carries the consumed qty (2).
    const tLines = await ds.query(
      `SELECT item_id, quantity FROM stock_transfer_lines WHERE transfer_id = $1`,
      [transferId],
    );
    expect(tLines).toHaveLength(1);
    expect(Number(tLines[0].quantity)).toBe(2);
    expect(tLines[0].item_id).toBe(itemId);

    // Consumed temp line -> TRANSFERRED (qty 2) with invoice + transfer links.
    const transferredLines = await ds.query(
      `SELECT quantity, invoice_id, invoice_number, transfer_id, superseded_by_id
         FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'TRANSFERRED'`,
      [sessionId, itemId],
    );
    expect(transferredLines).toHaveLength(1);
    expect(Number(transferredLines[0].quantity)).toBe(2);
    expect(transferredLines[0].invoice_id).toBe(invoiceId);
    expect(transferredLines[0].transfer_id).toBe(transferId);
    expect(transferredLines[0].superseded_by_id).toBeTruthy();

    // Remainder (3) stays ACTIVE.
    const activeLines = await ds.query(
      `SELECT quantity FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'ACTIVE'`,
      [sessionId, itemId],
    );
    expect(activeLines).toHaveLength(1);
    expect(Number(activeLines[0].quantity)).toBe(3);

    // Ledger: stock moved out of the warehouse shelf and into the showroom shelf.
    const ledger = await ds.query(
      `SELECT location_id, quantity FROM stock_ledger_entries WHERE reference_id = $1`,
      [transferId],
    );
    expect(ledger.length).toBeGreaterThanOrEqual(2);
    const outLeg = ledger.find((l: any) => Number(l.quantity) < 0);
    const inLeg = ledger.find((l: any) => Number(l.quantity) > 0);
    expect(outLeg.location_id).toBe(whLocationId);
    expect(Number(outLeg.quantity)).toBe(-2);
    expect(inLeg.location_id).toBe(srLocationId);
    expect(Number(inLeg.quantity)).toBe(2);
  });

  it('fully consumes when tempQty < saleQty (transfers tempQty, no remainder)', async () => {
    const itemId = await createItem('FULL-1');
    await addW2sLine(itemId, '1.00');

    const invoiceId = randomUUID();
    await service.fulfillInvoiceFromTempWarehouse(
      fulfillPayload(invoiceId, 'INV-FULL-1', [{ itemId, quantity: 3 }]),
      actor,
    );

    const tLines = await ds.query(
      `SELECT stl.quantity FROM stock_transfer_lines stl
         JOIN stock_transfers st ON st.id = stl.transfer_id
        WHERE st.invoice_id = $1`,
      [invoiceId],
    );
    expect(tLines).toHaveLength(1);
    expect(Number(tLines[0].quantity)).toBe(1);

    const transferred = await ds.query(
      `SELECT quantity, superseded_by_id FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'TRANSFERRED'`,
      [sessionId, itemId],
    );
    expect(transferred).toHaveLength(1);
    expect(Number(transferred[0].quantity)).toBe(1);
    expect(transferred[0].superseded_by_id).toBeNull(); // no remainder

    const active = await ds.query(
      `SELECT id FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'ACTIVE'`,
      [sessionId, itemId],
    );
    expect(active).toHaveLength(0);
  });

  it('no-ops when the sold item is not staged in the temp warehouse', async () => {
    const itemId = await createItem('UNSTAGED-1'); // no W2S line added
    const invoiceId = randomUUID();

    await service.fulfillInvoiceFromTempWarehouse(
      fulfillPayload(invoiceId, 'INV-UNSTAGED-1', [{ itemId, quantity: 4 }]),
      actor,
    );

    const transfers = await ds.query(
      `SELECT id FROM stock_transfers WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(transfers).toHaveLength(0);
  });

  it('is idempotent on replay of the same invoiceId', async () => {
    const itemId = await createItem('IDEMP-1');
    await addW2sLine(itemId, '5.00');

    const invoiceId = randomUUID();
    const payload = fulfillPayload(invoiceId, 'INV-IDEMP-1', [
      { itemId, quantity: 2 },
    ]);

    await service.fulfillInvoiceFromTempWarehouse(payload, actor);
    await service.fulfillInvoiceFromTempWarehouse(payload, actor); // replay

    const transfers = await ds.query(
      `SELECT id FROM stock_transfers WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(transfers).toHaveLength(1); // no second transfer

    const transferred = await ds.query(
      `SELECT id FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'TRANSFERRED'`,
      [sessionId, itemId],
    );
    expect(transferred).toHaveLength(1); // not split twice

    const active = await ds.query(
      `SELECT quantity FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'ACTIVE'`,
      [sessionId, itemId],
    );
    expect(active).toHaveLength(1);
    expect(Number(active[0].quantity)).toBe(3);
  });

  it('lines query surfaces TRANSFERRED-by-sale rows and excludes manual transfers', async () => {
    const saleItemId = await createItem('LINESQ-SALE');
    await addW2sLine(saleItemId, '1.00');
    const invoiceId = randomUUID();
    await service.fulfillInvoiceFromTempWarehouse(
      fulfillPayload(invoiceId, 'INV-LINESQ-1', [{ itemId: saleItemId, quantity: 1 }]),
      actor,
    );
    const saleLine = await ds.query(
      `SELECT id FROM temp_warehouse_lines
        WHERE session_id = $1 AND item_id = $2 AND status = 'TRANSFERRED'`,
      [sessionId, saleItemId],
    );
    const saleLineId = saleLine[0].id;

    // A manual TRANSFERRED line (no invoice link) must NOT surface.
    const manualItemId = await createItem('LINESQ-MANUAL');
    const manualLine = await ds.getRepository(TempWarehouseLineEntity).save(
      ds.getRepository(TempWarehouseLineEntity).create({
        organizationId: seed.organizationId,
        branchId: seed.branchId,
        sessionId,
        itemId: manualItemId,
        direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        quantity: '1.00',
        status: TempWarehouseLineStatus.TRANSFERRED,
        transferId: randomUUID(),
        createdBy: seed.userId,
      }),
    );

    const withTransferred = (await service.listLines(
      { branchId: seed.branchId, includeTransferred: true } as any,
      actor,
    )) as { data: Array<{ id: string; invoiceNumber?: string | null }> };
    const ids = withTransferred.data.map((r) => r.id);
    expect(ids).toContain(saleLineId);
    expect(ids).not.toContain(manualLine.id);
    const saleRow = withTransferred.data.find((r) => r.id === saleLineId);
    expect(saleRow?.invoiceNumber).toBe('INV-LINESQ-1');

    // Default (no flag) excludes every TRANSFERRED row.
    const defaultList = (await service.listLines(
      { branchId: seed.branchId } as any,
      actor,
    )) as { data: Array<{ id: string }> };
    const defaultIds = defaultList.data.map((r) => r.id);
    expect(defaultIds).not.toContain(saleLineId);
    expect(defaultIds).not.toContain(manualLine.id);
  });
});
