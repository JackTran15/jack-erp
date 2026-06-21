import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ImportJobStatus } from '@erp/shared-interfaces';
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
import { ExcelImportStockTakeService } from './excel-import-stock-take.service';
import { ExcelImportGoodsReceiptService } from './excel-import-goods-receipt.service';
import { ExcelImportDocumentLinesService } from './excel-import-document-lines.service';
import { InventoryImportWorkbookService } from './import-workbook/inventory-import-workbook.service';

describe('CsvImportService.cancelJob', () => {
  let service: CsvImportService;
  let jobRepo: Record<string, jest.Mock>;
  let rowRepo: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  beforeEach(async () => {
    jobRepo = {
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    rowRepo = { delete: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvImportService,
        { provide: getRepositoryToken(InventoryImportJobEntity), useValue: jobRepo },
        { provide: getRepositoryToken(InventoryImportJobRowEntity), useValue: rowRepo },
        { provide: getRepositoryToken(ItemEntity), useValue: {} },
        { provide: getRepositoryToken(ItemProviderEntity), useValue: {} },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: InventoryLocationService, useValue: {} },
        { provide: StockLedgerService, useValue: {} },
        { provide: WebSocketEmitterService, useValue: {} },
        { provide: ExcelParserService, useValue: {} },
        { provide: ExcelImportItemService, useValue: {} },
        { provide: ExcelImportStockTakeService, useValue: {} },
        { provide: ExcelImportGoodsReceiptService, useValue: {} },
        { provide: ExcelImportDocumentLinesService, useValue: {} },
        {
          provide: InventoryImportWorkbookService,
          useValue: { buildItemsWorkbookBuffer: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CsvImportService);
  });

  it('deletes job and rows when status is VALIDATED', async () => {
    jobRepo.findOne.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      status: ImportJobStatus.VALIDATED,
    });

    await service.cancelJob('job-1', actor);

    expect(rowRepo.delete).toHaveBeenCalledWith({ jobId: 'job-1' });
    expect(jobRepo.delete).toHaveBeenCalledWith('job-1');
  });

  it('rejects COMMITTED jobs', async () => {
    jobRepo.findOne.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      status: ImportJobStatus.COMMITTED,
    });

    await expect(service.cancelJob('job-1', actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rowRepo.delete).not.toHaveBeenCalled();
  });

  it('throws when job not found', async () => {
    jobRepo.findOne.mockResolvedValue(null);

    await expect(service.cancelJob('missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
