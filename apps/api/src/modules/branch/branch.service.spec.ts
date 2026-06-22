import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BranchEntity } from './branch.entity';
import { UserBranchAssignmentEntity } from './user-branch-assignment.entity';
import { BranchService } from './branch.service';
import { OrganizationService } from '../organization/organization.service';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { BranchCashProvisioningService } from '../accounting/cash/branch-cash-provisioning.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { StorageEntity } from '../inventory/location/storage.entity';
import { ShowroomEntity } from '../inventory/location/showroom.entity';
import { LocationEntity } from '../inventory/location/location.entity';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  roles: ['admin'],
};

const branchStub = (overrides: Partial<BranchEntity> = {}): BranchEntity =>
  ({
    id: 'branch-1',
    organizationId: 'org-1',
    name: 'Main HQ',
    status: BranchStatus.ACTIVE,
    isMainBranch: true,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as BranchEntity;

describe('BranchService', () => {
  let service: BranchService;
  let branchRepo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let assignmentRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let orgService: { setMainBranch: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let manager: {
    getRepository: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let locationInserts: Array<{ entity: unknown; values: Record<string, unknown> }>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    branchRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 'branch-new', ...entity })),
    };
    assignmentRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ id: 'asgn-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      remove: jest.fn(),
    };
    orgService = { setMainBranch: jest.fn() };
    docNumbering = { generate: jest.fn().mockResolvedValue('WH000099') };

    // Fake EntityManager: create() tags rows with their entity class so tests can
    // find the StorageEntity/ShowroomEntity payloads; save() stamps a per-class id.
    // createQueryBuilder() captures the insert().into().values() payload so tests
    // can assert the default-location insert.
    locationInserts = [];
    manager = {
      getRepository: jest.fn(() => ({
        create: (dto: Record<string, unknown>) => ({ ...dto }),
        save: (entity: Record<string, unknown>) =>
          Promise.resolve({ id: 'branch-new', ...entity }),
      })),
      create: jest.fn((Entity: { name: string }, dto: Record<string, unknown>) => ({
        __type: Entity,
        ...dto,
      })),
      save: jest.fn((entity: { __type?: { name: string } }) =>
        Promise.resolve({ id: `${entity.__type?.name ?? 'row'}-id`, ...entity }),
      ),
      createQueryBuilder: jest.fn(() => {
        const qb: Record<string, unknown> = {};
        const insert: { entity?: unknown; values?: Record<string, unknown> } = {};
        Object.assign(qb, {
          insert: () => qb,
          into: (entity: unknown) => {
            insert.entity = entity;
            return qb;
          },
          values: (values: Record<string, unknown>) => {
            insert.values = values;
            return qb;
          },
          orIgnore: () => qb,
          execute: () => {
            locationInserts.push({ entity: insert.entity, values: insert.values ?? {} });
            return Promise.resolve({});
          },
        });
        return qb;
      }),
    };
    dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => unknown) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchService,
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        {
          provide: getRepositoryToken(UserBranchAssignmentEntity),
          useValue: assignmentRepo,
        },
        { provide: OrganizationService, useValue: orgService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        {
          provide: BranchCashProvisioningService,
          useValue: { ensureBranchCashFund: jest.fn() },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(BranchService);
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('sets isMainBranch=true when it is the first branch', async () => {
      branchRepo.findOne.mockResolvedValue(null);
      branchRepo.count.mockResolvedValue(0);
      orgService.setMainBranch.mockResolvedValue(undefined);

      const result = await service.create({ name: 'HQ' }, actor);

      expect(result.isMainBranch).toBe(true);
      expect(orgService.setMainBranch).toHaveBeenCalledWith(
        'org-1',
        expect.any(String),
      );
    });

    it('subsequent branches are not main', async () => {
      branchRepo.findOne.mockResolvedValue(null);
      branchRepo.count.mockResolvedValue(1);

      const result = await service.create({ name: 'Branch 2' }, actor);

      expect(result.isMainBranch).toBe(false);
      expect(orgService.setMainBranch).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate name', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub());

      await expect(
        service.create({ name: 'Main HQ' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('auto-creates the branch showroom backed by a main storage', async () => {
      branchRepo.findOne.mockResolvedValue(null);
      branchRepo.count.mockResolvedValue(1);

      await service.create({ name: 'HQ' }, actor);

      const storageCall = manager.create.mock.calls.find(
        (c) => c[0] === StorageEntity,
      );
      expect(storageCall?.[1]).toMatchObject({
        name: 'HQ - Showroom',
        isMainStorage: true,
        isDefaultReceiving: true,
        code: 'WH000099',
        branchId: 'branch-new',
      });
      expect(docNumbering.generate).toHaveBeenCalled();

      const showroomCall = manager.create.mock.calls.find(
        (c) => c[0] === ShowroomEntity,
      );
      expect(showroomCall?.[1]).toMatchObject({
        name: 'HQ - Showroom',
        isMainShowroom: true,
        branchId: 'branch-new',
        storageId: 'StorageEntity-id',
      });
    });

    it('creates a default "Mặc định" location in the showroom storage', async () => {
      branchRepo.findOne.mockResolvedValue(null);
      branchRepo.count.mockResolvedValue(1);

      await service.create({ name: 'HQ' }, actor);

      const insert = locationInserts.find((i) => i.entity === LocationEntity);
      expect(insert?.values).toMatchObject({
        code: 'DEFAULT',
        isDefault: true,
        storageId: 'StorageEntity-id',
        branchId: 'branch-new',
      });
    });
  });

  // =========================================================================
  // archive
  // =========================================================================
  describe('archive', () => {
    it('rejects when active sub-branches exist', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED }),
      );
      branchRepo.count
        .mockResolvedValueOnce(1) // active sub-branches
        .mockResolvedValueOnce(0);

      await expect(service.archive('branch-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when suspended sub-branches exist', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED }),
      );
      branchRepo.count
        .mockResolvedValueOnce(0) // active
        .mockResolvedValueOnce(1); // suspended

      await expect(service.archive('branch-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when branch is not SUSPENDED', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE }),
      );

      await expect(service.archive('branch-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('archives a suspended branch with no sub-branches', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED }),
      );
      branchRepo.count.mockResolvedValue(0);

      const result = await service.archive('branch-1', actor);

      expect(result.status).toBe(BranchStatus.ARCHIVED);
      expect(branchRepo.save).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // suspend
  // =========================================================================
  describe('suspend', () => {
    it('suspends an ACTIVE branch', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE }),
      );

      const result = await service.suspend('branch-1', actor);

      expect(result.status).toBe(BranchStatus.SUSPENDED);
    });

    it('rejects if branch is not ACTIVE', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED }),
      );

      await expect(service.suspend('branch-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // assignUser / unassignUser
  // =========================================================================
  describe('assignUser', () => {
    it('assigns a user to a branch', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub());
      assignmentRepo.findOne.mockResolvedValue(null);

      const result = await service.assignUser('branch-1', 'user-2', actor);

      expect(assignmentRepo.create).toHaveBeenCalledWith({
        userId: 'user-2',
        branchId: 'branch-1',
        organizationId: 'org-1',
        assignedBy: 'user-1',
      });
      expect(assignmentRepo.save).toHaveBeenCalled();
      expect(result.userId).toBe('user-2');
    });

    it('throws ConflictException when user is already assigned', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub());
      assignmentRepo.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.assignUser('branch-1', 'user-2', actor),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unassignUser', () => {
    it('removes user assignment from a branch', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub());
      const assignment = { id: 'asgn-1', userId: 'user-2', branchId: 'branch-1' };
      assignmentRepo.findOne.mockResolvedValue(assignment);

      await service.unassignUser('branch-1', 'user-2', actor);

      expect(assignmentRepo.remove).toHaveBeenCalledWith(assignment);
    });

    it('throws NotFoundException when assignment does not exist', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub());
      assignmentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.unassignUser('branch-1', 'user-2', actor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
