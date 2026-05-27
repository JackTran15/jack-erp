import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CsvImportService } from './csv-import.service';
import { InventoryImportJobEntity } from './inventory-import-job.entity';
import { InventoryImportJobRowEntity } from './inventory-import-job-row.entity';
import { ItemEntity } from '../location/item.entity';
import { ItemProviderEntity } from '../location/item-provider.entity';
import { InventoryLocationService } from '../location/inventory-location.service';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { ExcelParserService } from './excel-parser.service';
import { ExcelImportItemService } from './excel-import-item.service';
import { InventoryImportWorkbookService } from './import-workbook/inventory-import-workbook.service';

/**
 * These tests lock in the append-only behavior of commitItemRow():
 *   - Importing the same (item, provider) link twice is a no-op.
 *   - When an item already has a primary provider, a newly imported
 *     provider is added as isPrimary=false. The existing primary is
 *     NOT demoted (intentional — differs from legacy CSV behavior).
 *
 * If a future change makes CSV import treat the import file as source of
 * truth and override the primary supplier, these tests should fail and
 * the behavior change should be discussed explicitly.
 */
describe('CsvImportService.commitItemRow', () => {
  let service: CsvImportService;
  let itemRepo: Record<string, jest.Mock>;
  let itemProviderRepo: Record<string, jest.Mock>;
  let locationService: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const provider = { id: 'prov-1', code: 'P1', organizationId: 'org-1' };

  const callCommitItemRow = (row: Record<string, unknown>) =>
    (service as unknown as {
      commitItemRow: (row: unknown, actor: unknown) => Promise<void>;
    }).commitItemRow(row, actor);

  beforeEach(async () => {
    itemRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    itemProviderRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    locationService = {
      resolveProviderByCode: jest.fn().mockResolvedValue(provider),
      resolveOrCreateCategoryByName: jest.fn().mockResolvedValue({ id: 'cat-1' }),
      createItem: jest.fn().mockResolvedValue({ id: 'item-new' }),
      updateItem: jest.fn().mockResolvedValue({ id: 'item-existing' }),
    };

    const noopRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    const noopService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvImportService,
        { provide: getRepositoryToken(InventoryImportJobEntity), useValue: noopRepo },
        { provide: getRepositoryToken(InventoryImportJobRowEntity), useValue: noopRepo },
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(ItemProviderEntity), useValue: itemProviderRepo },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: InventoryLocationService, useValue: locationService },
        { provide: StockLedgerService, useValue: noopService },
        { provide: WebSocketEmitterService, useValue: noopService },
        {
          provide: ExcelParserService,
          useValue: { parseInventoryItemsWorkbook: jest.fn() },
        },
        {
          provide: ExcelImportItemService,
          useValue: { commitRow: jest.fn(), resetCaches: jest.fn() },
        },
        {
          provide: InventoryImportWorkbookService,
          useValue: { buildItemsWorkbookBuffer: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CsvImportService);
  });

  const makeRow = () => ({
    id: 'row-1',
    rawData: {
      itemCode: 'SKU-1',
      itemName: 'Item 1',
      uom: 'pcs',
      providerCode: 'P1',
      category: 'CatA',
      isActive: 'true',
    },
  });

  it('links new provider as primary when item is new (no existing primary)', async () => {
    locationService.createItem.mockResolvedValueOnce({ id: 'item-1' });
    itemProviderRepo.count.mockResolvedValueOnce(0);

    await callCommitItemRow(makeRow());

    expect(itemProviderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        providerId: 'prov-1',
        isPrimary: true,
      }),
    );
  });

  it('appends new provider as non-primary when item already has a primary supplier', async () => {
    locationService.createItem.mockRejectedValueOnce(new ConflictException('exists'));
    itemRepo.findOne.mockResolvedValueOnce({ id: 'item-existing', code: 'SKU-1' });
    itemProviderRepo.findOne.mockResolvedValueOnce(null);
    itemProviderRepo.count.mockResolvedValueOnce(1);

    await callCommitItemRow(makeRow());

    expect(itemProviderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-existing',
        providerId: 'prov-1',
        isPrimary: false,
      }),
    );
  });

  it('is a no-op on item_providers when the (item, provider) link already exists', async () => {
    locationService.createItem.mockRejectedValueOnce(new ConflictException('exists'));
    itemRepo.findOne.mockResolvedValueOnce({ id: 'item-existing', code: 'SKU-1' });
    itemProviderRepo.findOne.mockResolvedValueOnce({
      id: 'ip-1',
      itemId: 'item-existing',
      providerId: 'prov-1',
      isPrimary: true,
    });

    await callCommitItemRow(makeRow());

    expect(itemProviderRepo.save).not.toHaveBeenCalled();
    expect(itemProviderRepo.create).not.toHaveBeenCalled();
    expect(itemProviderRepo.count).not.toHaveBeenCalled();
  });

  it('promotes new provider to primary when existing item has no primary yet', async () => {
    locationService.createItem.mockRejectedValueOnce(new ConflictException('exists'));
    itemRepo.findOne.mockResolvedValueOnce({ id: 'item-existing', code: 'SKU-1' });
    itemProviderRepo.findOne.mockResolvedValueOnce(null);
    itemProviderRepo.count.mockResolvedValueOnce(0);

    await callCommitItemRow(makeRow());

    expect(itemProviderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-existing',
        providerId: 'prov-1',
        isPrimary: true,
      }),
    );
  });
});
