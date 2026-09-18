import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CashVoucherCategoryDirection } from '../enums';
import { CashVoucherCategoryEntity } from './cash-voucher-category.entity';
import {
  CASH_VOUCHER_CATEGORY_ENTITY_CONFIG,
  CashVoucherCategoriesService,
} from './cash-voucher-categories.service';

const IN = CashVoucherCategoryDirection.IN;
const OUT = CashVoucherCategoryDirection.OUT;

interface Row {
  id: string;
  organizationId: string;
  direction: CashVoucherCategoryDirection;
  parentGroupId: string | null;
  deletedAt?: Date;
}

/**
 * The repository is an in-memory map that behaves like TypeORM's default
 * find options: `findOne`/`count` match on `id`/`parentGroupId` +
 * `organizationId` and skip soft-deleted rows.
 */
describe('CashVoucherCategoriesService', () => {
  let service: CashVoucherCategoriesService;
  let repo: Record<string, jest.Mock>;
  let runner: Record<string, any>;
  let db: Map<string, Row>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  } as any;

  const rows: Row[] = [
    { id: 'root-out', organizationId: 'org-1', direction: OUT, parentGroupId: null },
    { id: 'child-out', organizationId: 'org-1', direction: OUT, parentGroupId: 'root-out' },
    { id: 'grandchild-out', organizationId: 'org-1', direction: OUT, parentGroupId: 'child-out' },
    { id: 'root-in', organizationId: 'org-1', direction: IN, parentGroupId: null },
    { id: 'leaf-parent', organizationId: 'org-1', direction: OUT, parentGroupId: null },
    {
      id: 'deleted-child',
      organizationId: 'org-1',
      direction: OUT,
      parentGroupId: 'leaf-parent',
      deletedAt: new Date('2026-01-01'),
    },
    {
      id: 'deleted-out',
      organizationId: 'org-1',
      direction: OUT,
      parentGroupId: null,
      deletedAt: new Date('2026-01-01'),
    },
    { id: 'other-org', organizationId: 'org-2', direction: OUT, parentGroupId: null },
  ];

  beforeEach(async () => {
    db = new Map(rows.map((r) => [r.id, { ...r }]));

    repo = {
      findOne: jest.fn(async ({ where }: { where: Partial<Row> }) => {
        const row = db.get(where.id as string);
        if (!row || row.organizationId !== where.organizationId || row.deletedAt) {
          return null;
        }
        return { ...row };
      }),
      count: jest.fn(async ({ where }: { where: Partial<Row> }) =>
        [...db.values()].filter(
          (r) =>
            r.parentGroupId === where.parentGroupId &&
            r.organizationId === where.organizationId &&
            !r.deletedAt,
        ).length,
      ),
      create: jest.fn((data) => ({ ...data, id: 'new' })),
      save: jest.fn(async (entity) => entity),
      merge: jest.fn((existing, updates) => ({ ...existing, ...updates })),
    };

    runner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(async (entity) => entity),
        remove: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashVoucherCategoriesService,
        { provide: getRepositoryToken(CashVoucherCategoryEntity), useValue: repo },
        {
          provide: DataSource,
          useValue: { createQueryRunner: jest.fn(() => runner) },
        },
      ],
    }).compile();

    service = module.get(CashVoucherCategoriesService);
  });

  const expectBadRequest = async (promise: Promise<unknown>, message: string) => {
    await expect(promise).rejects.toThrow(BadRequestException);
    await expect(promise).rejects.toThrow(message);
  };

  describe('create', () => {
    it('creates a root without looking up a parent', async () => {
      await service.create({ code: 'A', name: 'A', direction: OUT }, actor);
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('creates a child under a parent of the same direction', async () => {
      await service.create(
        { code: 'B', name: 'B', direction: OUT, parentGroupId: 'root-out' },
        actor,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentGroupId: 'root-out', organizationId: 'org-1' }),
      );
    });

    it('normalises an empty parentGroupId to null (root)', async () => {
      await service.create({ code: 'C', name: 'C', direction: OUT, parentGroupId: '' }, actor);
      expect(repo.findOne).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ parentGroupId: null }));
    });

    it('rejects a parent from another organization', async () => {
      await expectBadRequest(
        service.create({ code: 'D', name: 'D', direction: OUT, parentGroupId: 'other-org' }, actor),
        'Mục cha không tồn tại',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted parent', async () => {
      await expectBadRequest(
        service.create({ code: 'E', name: 'E', direction: OUT, parentGroupId: 'deleted-out' }, actor),
        'Mục cha không tồn tại',
      );
    });

    it('rejects a parent of the other direction', async () => {
      await expectBadRequest(
        service.create({ code: 'F', name: 'F', direction: IN, parentGroupId: 'root-out' }, actor),
        'Mục cha phải cùng loại Thu/Chi',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects a node as its own parent', async () => {
      await expectBadRequest(
        service.update('root-out', { parentGroupId: 'root-out' }, actor),
        'Mục không thể là mục cha của chính nó',
      );
    });

    it('rejects a two-level cycle (A → B → A)', async () => {
      await expectBadRequest(
        service.update('root-out', { parentGroupId: 'child-out' }, actor),
        'Không thể chọn mục con làm mục cha',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a deeper cycle (A → B → C → A)', async () => {
      await expectBadRequest(
        service.update('root-out', { parentGroupId: 'grandchild-out' }, actor),
        'Không thể chọn mục con làm mục cha',
      );
    });

    it('rejects a direction change that no longer matches the kept parent', async () => {
      await expectBadRequest(
        service.update('grandchild-out', { direction: IN }, actor),
        'Mục cha phải cùng loại Thu/Chi',
      );
    });

    it('rejects a direction change on a node that has children', async () => {
      await expectBadRequest(
        service.update('root-out', { direction: IN }, actor),
        'Không thể đổi loại của mục đang có mục con',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects moving under a parent of the other direction', async () => {
      await expectBadRequest(
        service.update('grandchild-out', { parentGroupId: 'root-in' }, actor),
        'Mục cha phải cùng loại Thu/Chi',
      );
    });

    it('moves a node to root with null, keeping its children', async () => {
      await service.update('child-out', { parentGroupId: null }, actor);
      expect(repo.merge).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'child-out' }),
        expect.objectContaining({ parentGroupId: null }),
      );
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('moves a node under another parent of the same direction', async () => {
      await service.update('grandchild-out', { parentGroupId: 'root-out' }, actor);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('allows a direction change on a leaf root', async () => {
      await service.update('leaf-parent', { direction: IN }, actor);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('entity config (served verbatim by GET /admin/entities/cash-voucher-categories)', () => {
    it('exposes parentGroupId as a self-referencing relation hidden from the list', () => {
      const field = CASH_VOUCHER_CATEGORY_ENTITY_CONFIG.fields.find((f) => f.key === 'parentGroupId');
      expect(field).toMatchObject({
        label: 'Mục cha',
        type: 'relation',
        relationEntity: 'cash-voucher-categories',
        hideInList: true,
      });
    });

    it('labels direction values in Vietnamese', () => {
      const field = CASH_VOUCHER_CATEGORY_ENTITY_CONFIG.fields.find((f) => f.key === 'direction');
      expect(field?.enumLabels).toEqual({ IN: 'Thu', OUT: 'Chi' });
    });
  });

  describe('remove', () => {
    it('refuses to delete a node with live children', async () => {
      await expectBadRequest(
        service.remove('root-out', actor),
        'Không thể xóa mục đang có mục con',
      );
      expect(runner.manager.save).not.toHaveBeenCalled();
    });

    it('soft-deletes a leaf', async () => {
      await service.remove('grandchild-out', actor);
      expect(runner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'grandchild-out', deletedAt: expect.any(Date) }),
      );
      expect(runner.manager.remove).not.toHaveBeenCalled();
    });

    it('ignores children that are already soft-deleted', async () => {
      await service.remove('leaf-parent', actor);
      expect(runner.manager.save).toHaveBeenCalledTimes(1);
    });
  });
});
