import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { InventoryStorageCrudService } from './storage-crud.service';
import { StorageEntity } from './storage.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';

describe('InventoryStorageCrudService', () => {
  let service: InventoryStorageCrudService;
  let repo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let docNumbering: { generate: jest.Mock };

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'storage-new' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    dataSource = {};
    docNumbering = { generate: jest.fn().mockResolvedValue('WH000123') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryStorageCrudService,
        { provide: getRepositoryToken(StorageEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
        { provide: DocumentNumberingService, useValue: docNumbering },
      ],
    }).compile();

    service = module.get(InventoryStorageCrudService);
  });

  describe('beforeCreate', () => {
    it('auto-generates a WAREHOUSE code when none is provided', async () => {
      const result = await (service as any).beforeCreate(
        { name: 'Kho 1' },
        actor,
      );

      expect(docNumbering.generate).toHaveBeenCalledWith(
        DocumentType.WAREHOUSE,
        'branch-1',
        actor,
      );
      expect(result.code).toBe('WH000123');
    });

    it('keeps a caller-supplied code and does not generate', async () => {
      const result = await (service as any).beforeCreate(
        { name: 'Kho 1', code: 'WH999999' },
        actor,
      );

      expect(docNumbering.generate).not.toHaveBeenCalled();
      expect(result.code).toBe('WH999999');
    });
  });
});
