import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BranchEntity } from './branch.entity';
import { UserBranchAssignmentEntity } from './user-branch-assignment.entity';
import { BranchService } from './branch.service';
import { OrganizationService } from '../organization/organization.service';
import { BranchCashProvisioningService } from '../accounting/cash/branch-cash-provisioning.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchService,
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        {
          provide: getRepositoryToken(UserBranchAssignmentEntity),
          useValue: assignmentRepo,
        },
        { provide: OrganizationService, useValue: orgService },
        {
          provide: BranchCashProvisioningService,
          useValue: { ensureBranchCashFund: jest.fn() },
        },
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
