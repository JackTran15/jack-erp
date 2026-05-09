import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProductAttributeService } from './product-attribute.service';
import { ProductEntity } from './product.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from './product-attribute-option.entity';

describe('ProductAttributeService', () => {
  let service: ProductAttributeService;
  let productRepo: Record<string, jest.Mock>;
  let defRepo: Record<string, jest.Mock>;
  let optionRepo: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const mockProduct: Partial<ProductEntity> = {
    id: 'prod-1',
    name: 'Test Product',
    organizationId: 'org-1',
  };

  const mockDef: Partial<ProductAttributeDefinitionEntity> = {
    id: 'def-1',
    productId: 'prod-1',
    name: 'Size',
    sortOrder: 0,
    organizationId: 'org-1',
    options: [],
  };

  const mockOption: Partial<ProductAttributeOptionEntity> = {
    id: 'opt-1',
    attributeDefinitionId: 'def-1',
    valueLabel: '39',
    sortOrder: 0,
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    productRepo = {
      findOne: jest.fn().mockResolvedValue(mockProduct),
    };

    defRepo = {
      find: jest.fn().mockResolvedValue([
        {
          ...mockDef,
          options: [mockOption, { ...mockOption, id: 'opt-2', valueLabel: '40' }],
        },
      ]),
      findOne: jest.fn().mockResolvedValue(mockDef),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'def-new' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    optionRepo = {
      findOne: jest.fn().mockResolvedValue(mockOption),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'opt-new' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductAttributeService,
        { provide: getRepositoryToken(ProductEntity), useValue: productRepo },
        {
          provide: getRepositoryToken(ProductAttributeDefinitionEntity),
          useValue: defRepo,
        },
        {
          provide: getRepositoryToken(ProductAttributeOptionEntity),
          useValue: optionRepo,
        },
      ],
    }).compile();

    service = module.get(ProductAttributeService);
  });

  describe('listDefinitions', () => {
    it('should return definitions sorted with options', async () => {
      const result = await service.listDefinitions('prod-1', actor);

      expect(result).toHaveLength(1);
      expect(result[0].options).toHaveLength(2);
      expect(defRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'prod-1', organizationId: 'org-1' },
          order: { sortOrder: 'ASC', createdAt: 'ASC' },
        }),
      );
    });

    it('should throw NotFoundException when product does not exist', async () => {
      productRepo.findOne.mockResolvedValue(null);
      await expect(
        service.listDefinitions('missing', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createDefinition', () => {
    it('should create and return a definition', async () => {
      const result = await service.createDefinition(
        'prod-1',
        { name: 'Color', sortOrder: 1 },
        actor,
      );

      expect(result.name).toBe('Color');
      expect(defRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          name: 'Color',
          organizationId: 'org-1',
        }),
      );
    });

    it('should throw ConflictException on duplicate name', async () => {
      const error = new QueryFailedError('', [], new Error());
      (error as any).code = '23505';
      defRepo.save.mockRejectedValue(error);

      await expect(
        service.createDefinition('prod-1', { name: 'Size' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('should re-throw non-unique-constraint errors', async () => {
      defRepo.save.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.createDefinition('prod-1', { name: 'Weight' }, actor),
      ).rejects.toThrow('DB connection lost');
    });
  });

  describe('updateDefinition', () => {
    it('should update definition name', async () => {
      const result = await service.updateDefinition(
        'prod-1',
        'def-1',
        { name: 'Kích cỡ' },
        actor,
      );

      expect(defRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Kích cỡ' }),
      );
    });

    it('should throw ConflictException if renamed to duplicate', async () => {
      const error = new QueryFailedError('', [], new Error());
      (error as any).code = '23505';
      defRepo.save.mockRejectedValue(error);

      await expect(
        service.updateDefinition('prod-1', 'def-1', { name: 'Color' }, actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteDefinition', () => {
    it('should delete the definition', async () => {
      await service.deleteDefinition('prod-1', 'def-1', actor);
      expect(defRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'def-1' }),
      );
    });

    it('should throw NotFoundException if definition is missing', async () => {
      defRepo.findOne.mockResolvedValue(null);
      await expect(
        service.deleteDefinition('prod-1', 'missing', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createOption', () => {
    it('should create and return an option', async () => {
      const result = await service.createOption(
        'prod-1',
        'def-1',
        { valueLabel: '41', codeSuffix: '41' },
        actor,
      );

      expect(optionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          attributeDefinitionId: 'def-1',
          valueLabel: '41',
          codeSuffix: '41',
        }),
      );
    });
  });

  describe('updateOption', () => {
    it('should update option valueLabel', async () => {
      await service.updateOption(
        'prod-1',
        'def-1',
        'opt-1',
        { valueLabel: '42' },
        actor,
      );

      expect(optionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ valueLabel: '42' }),
      );
    });
  });

  describe('deleteOption', () => {
    it('should delete the option', async () => {
      await service.deleteOption('prod-1', 'def-1', 'opt-1', actor);
      expect(optionRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'opt-1' }),
      );
    });

    it('should throw NotFoundException if option is missing', async () => {
      optionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.deleteOption('prod-1', 'def-1', 'missing', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
