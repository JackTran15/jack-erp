import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { ExcelImportStockTakeService } from './excel-import-stock-take.service';
import {
  ImportDuplicateMode,
  InventoryImportExcelField,
  type InventoryImportExcelRow,
} from '@erp/shared-interfaces';

describe('CsvImportService.validateExcelItemRow', () => {
  let service: CsvImportService;
  let itemRepo: { findOne: jest.Mock };

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const callValidate = (
    row: InventoryImportExcelRow,
    mode: ImportDuplicateMode,
    existingSkuCodes?: Set<string>,
  ) =>
    (
      service as unknown as {
        validateExcelItemRow: (
          row: InventoryImportExcelRow,
          actor: unknown,
          mode: ImportDuplicateMode,
          existingSkuCodes?: Set<string>,
        ) => Promise<Array<{ code: string; message: string }>>;
      }
    ).validateExcelItemRow(row, actor, mode, existingSkuCodes);

  beforeEach(async () => {
    itemRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const noopRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    const noopService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvImportService,
        { provide: getRepositoryToken(InventoryImportJobEntity), useValue: noopRepo },
        { provide: getRepositoryToken(InventoryImportJobRowEntity), useValue: noopRepo },
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(ItemProviderEntity), useValue: noopRepo },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: InventoryLocationService, useValue: noopService },
        { provide: StockLedgerService, useValue: noopService },
        { provide: WebSocketEmitterService, useValue: noopService },
        { provide: ExcelParserService, useValue: noopService },
        { provide: ExcelImportItemService, useValue: noopService },
        {
          provide: InventoryImportWorkbookService,
          useValue: { buildItemsWorkbookBuffer: jest.fn() },
        },
        { provide: ExcelImportStockTakeService, useValue: noopService },
      ],
    }).compile();

    service = module.get(CsvImportService);
  });

  it('requires SKU and item name', async () => {
    const errors = await callValidate(
      {
        [InventoryImportExcelField.SKU_CODE]: '',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: '',
      },
      ImportDuplicateMode.UPDATE,
    );
    expect(errors.some((e) => e.code === 'REQUIRED')).toBe(true);
  });

  it('flags duplicate SKU when mode is SKIP', async () => {
    const errors = await callValidate(
      {
        [InventoryImportExcelField.SKU_CODE]: 'SKU-1',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Hàng A',
        [InventoryImportExcelField.UNIT_NAME]: 'Cái',
      },
      ImportDuplicateMode.SKIP,
      new Set(['SKU-1']),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_SKU',
          message: 'Mã SKU "SKU-1" đã tồn tại trong hệ thống.',
        }),
      ]),
    );
  });

  it('allows duplicate SKU when mode is UPDATE', async () => {
    const errors = await callValidate(
      {
        [InventoryImportExcelField.SKU_CODE]: 'SKU-1',
        [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 'Hàng A',
        [InventoryImportExcelField.UNIT_NAME]: 'Cái',
      },
      ImportDuplicateMode.UPDATE,
    );
    expect(errors.find((e) => e.code === 'DUPLICATE_SKU')).toBeUndefined();
  });
});
