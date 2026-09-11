import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import {
  INVENTORY_STORAGE_ENTITY_CONFIG,
  InventoryStorageCrudService,
} from './storage-crud.service';
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

  describe('beforeUpdate', () => {
    it('strips isDefaultIssuing from a generic PATCH payload without erroring', async () => {
      const result = await (service as any).beforeUpdate(
        'storage-1',
        { name: 'Kho 1', isDefaultIssuing: true },
        actor,
      );

      expect(result).not.toHaveProperty('isDefaultIssuing');
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('refuses to deactivate the default issuing warehouse', async () => {
      repo.findOne.mockResolvedValue({
        id: 'storage-1',
        branchId: 'branch-1',
        isDefaultIssuing: true,
      });

      await expect(
        (service as any).beforeUpdate(
          'storage-1',
          { isActive: false },
          actor,
        ),
      ).rejects.toThrow(
        'Không thể ngừng hoạt động kho xuất hàng mặc định. Hãy đặt kho khác làm kho xuất mặc định trước.',
      );
    });

    it('allows deactivating a storage that is not a default warehouse', async () => {
      repo.findOne.mockResolvedValue({
        id: 'storage-1',
        branchId: 'branch-1',
        isMainStorage: false,
        isDefaultReceiving: false,
        isDefaultIssuing: false,
      });

      const result = await (service as any).beforeUpdate(
        'storage-1',
        { isActive: false },
        actor,
      );

      expect(result).toEqual({ isActive: false });
    });

    it('refuses to deactivate the showroom storage', async () => {
      repo.findOne.mockResolvedValue({
        id: 'storage-1',
        branchId: 'branch-1',
        isMainStorage: true,
      });

      await expect(
        (service as any).beforeUpdate(
          'storage-1',
          { isActive: false },
          actor,
        ),
      ).rejects.toThrow(
        'Không thể ngừng hoạt động kho showroom (kho bán hàng mặc định).',
      );
    });

    it('refuses to deactivate the default receiving warehouse', async () => {
      repo.findOne.mockResolvedValue({
        id: 'storage-1',
        branchId: 'branch-1',
        isDefaultReceiving: true,
      });

      await expect(
        (service as any).beforeUpdate(
          'storage-1',
          { isActive: false },
          actor,
        ),
      ).rejects.toThrow(
        'Không thể ngừng hoạt động kho nhập hàng mặc định. Hãy đặt kho khác làm kho nhập mặc định trước.',
      );
    });
  });

  describe('INVENTORY_STORAGE_ENTITY_CONFIG', () => {
    it('exposes isDefaultIssuing as a field with the Vietnamese label', () => {
      const field = INVENTORY_STORAGE_ENTITY_CONFIG.fields.find(
        (f) => f.key === 'isDefaultIssuing',
      );

      expect(field).toBeDefined();
      expect(field?.label).toBe('Kho xuất hàng mặc định');
      expect(field?.type).toBe('boolean');
    });

    it('exposes isDefaultIssuing as a filterDefinition with the Vietnamese label', () => {
      const filter = INVENTORY_STORAGE_ENTITY_CONFIG.filterDefinitions?.find(
        (f) => f.key === 'isDefaultIssuing',
      );

      expect(filter).toBeDefined();
      expect(filter?.label).toBe('Kho xuất hàng mặc định');
    });
  });
});
