import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BranchEntity } from './branch.entity';
import { UserBranchAssignmentEntity } from './user-branch-assignment.entity';
import { BranchService } from './branch.service';
import { BranchStatusService } from './branch-status.service';
import { RbacService } from '../rbac/rbac.service';
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
    find: jest.Mock;
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
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let branchStatus: { invalidate: jest.Mock };
  let rbac: { hasPermission: jest.Mock };

  beforeEach(async () => {
    branchRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
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
    branchStatus = { invalidate: jest.fn().mockResolvedValue(undefined) };
    // Privileged by default; the permission cases override it.
    rbac = { hasPermission: jest.fn().mockResolvedValue(true) };
    dataSource = {
      query: jest.fn().mockResolvedValue([{ count: 0 }]),
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
        { provide: BranchStatusService, useValue: branchStatus },
        { provide: RbacService, useValue: rbac },
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
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.suspend('branch-1', actor);

      expect(result.status).toBe(BranchStatus.SUSPENDED);
    });

    it('rejects if branch is not ACTIVE', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED, isMainBranch: false }),
      );

      await expect(service.suspend('branch-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses to suspend the organization main branch', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: true }),
      );

      await expect(service.suspend('branch-1', actor)).rejects.toThrow(
        'Không thể ngừng hoạt động cửa hàng chính của tổ chức.',
      );
      expect(branchRepo.save).not.toHaveBeenCalled();
    });

    it('drops the status cache so the change takes effect at once', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      await service.suspend('branch-1', actor);

      expect(branchStatus.invalidate).toHaveBeenCalledWith('org-1');
    });
  });

  // =========================================================================
  // activate
  // =========================================================================
  describe('activate', () => {
    it('brings a SUSPENDED branch back', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED, isMainBranch: false }),
      );

      const result = await service.activate('branch-1', actor);

      expect(result.status).toBe(BranchStatus.ACTIVE);
      expect(branchStatus.invalidate).toHaveBeenCalledWith('org-1');
    });

    it('refuses an ARCHIVED branch', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ARCHIVED, isMainBranch: false }),
      );

      await expect(service.activate('branch-1', actor)).rejects.toThrow(
        'Cửa hàng đã đóng vĩnh viễn, không thể mở lại.',
      );
    });

    it('refuses a branch that is already ACTIVE', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      await expect(service.activate('branch-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // update — status must not slip past the lifecycle rules
  // =========================================================================
  describe('update', () => {
    it('routes a status change through suspend() instead of assigning it', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.update(
        'branch-1',
        { status: BranchStatus.SUSPENDED },
        actor,
      );

      expect(result.status).toBe(BranchStatus.SUSPENDED);
      expect(branchStatus.invalidate).toHaveBeenCalledWith('org-1');
    });

    it('routes a status change through activate()', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED, isMainBranch: false }),
      );

      const result = await service.update(
        'branch-1',
        { status: BranchStatus.ACTIVE },
        actor,
      );

      expect(result.status).toBe(BranchStatus.ACTIVE);
    });

    it('cannot suspend the main branch by PATCHing status', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: true }),
      );

      await expect(
        service.update('branch-1', { status: BranchStatus.SUSPENDED }, actor),
      ).rejects.toThrow('Không thể ngừng hoạt động cửa hàng chính của tổ chức.');
      expect(branchRepo.save).not.toHaveBeenCalled();
    });

    it('writes nothing at all when the transition is rejected', async () => {
      // Renaming the head office while ticking "Ngừng hoạt động" must not
      // leave the rename committed behind a 400.
      branchRepo.findOne.mockResolvedValue(
        branchStub({
          status: BranchStatus.ACTIVE,
          isMainBranch: true,
          phone: '0111',
        }),
      );

      await expect(
        service.update(
          'branch-1',
          { phone: '0900', status: BranchStatus.SUSPENDED },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(branchRepo.save).not.toHaveBeenCalled();
      expect(branchStatus.invalidate).not.toHaveBeenCalled();
    });

    it('applies the rename and the suspend in a single save', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.update(
        'branch-1',
        { name: 'Hà Nội 2', status: BranchStatus.SUSPENDED },
        actor,
      );

      expect(result.name).toBe('Hà Nội 2');
      expect(result.status).toBe(BranchStatus.SUSPENDED);
      expect(branchRepo.save).toHaveBeenCalledTimes(1);
    });

    it('refuses to reach ARCHIVED through a PATCH', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.SUSPENDED, isMainBranch: false }),
      );

      await expect(
        service.update('branch-1', { status: BranchStatus.ARCHIVED }, actor),
      ).rejects.toThrow(
        'Lưu trữ cửa hàng phải thực hiện qua chức năng lưu trữ riêng.',
      );
      expect(branchRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a status change from an actor without branch.archive', async () => {
      // Both PATCH /branches/:id and the generic CRUD PATCH land here. Guarding
      // either controller alone would leave the other one open — that is why
      // the check lives in the service.
      rbac.hasPermission.mockResolvedValue(false);
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      await expect(
        service.update('branch-1', { status: BranchStatus.SUSPENDED }, actor),
      ).rejects.toThrow(ForbiddenException);
      expect(branchRepo.save).not.toHaveBeenCalled();
    });

    it('still lets that actor edit ordinary fields', async () => {
      rbac.hasPermission.mockResolvedValue(false);
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.update('branch-1', { phone: '0900' }, actor);

      expect(result.phone).toBe('0900');
      // No status in the payload means no permission lookup at all.
      expect(rbac.hasPermission).not.toHaveBeenCalled();
    });

    it('does not demand branch.archive when the posted status is unchanged', async () => {
      // The branch form posts every field on every save, so re-saving without
      // touching the checkbox must not escalate.
      rbac.hasPermission.mockResolvedValue(false);
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      await expect(
        service.update('branch-1', { status: BranchStatus.ACTIVE }, actor),
      ).resolves.toBeDefined();
      expect(rbac.hasPermission).not.toHaveBeenCalled();
    });

    it('checks the permission before the transition rules, so an unprivileged actor cannot probe state', async () => {
      rbac.hasPermission.mockResolvedValue(false);
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: true }),
      );

      // Main branch AND no permission: the 403 must win over the 400, or the
      // response tells an unprivileged caller which branch is the head office.
      await expect(
        service.update('branch-1', { status: BranchStatus.SUSPENDED }, actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an ARCHIVED branch be renamed without touching its status', async () => {
      // The form posts every field on every save. If it also posted `status`
      // unconditionally, an archived branch would receive status:'ACTIVE' and
      // 400 on a plain rename — the regression caught in review.
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ARCHIVED, isMainBranch: false }),
      );

      const result = await service.update('branch-1', { name: 'Tên mới' }, actor);

      expect(result.name).toBe('Tên mới');
      expect(result.status).toBe(BranchStatus.ARCHIVED);
      expect(rbac.hasPermission).not.toHaveBeenCalled();
    });

    it('rejects a status outside the enum instead of letting Postgres 500', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      await expect(
        service.update(
          'branch-1',
          { status: 'bogus' as never },
          actor,
        ),
      ).rejects.toThrow('Trạng thái cửa hàng không hợp lệ.');
      expect(branchRepo.save).not.toHaveBeenCalled();
    });

    it('still succeeds when the cache cannot be invalidated', async () => {
      // The row is already committed; a Redis outage must not report failure
      // for a change that happened. The short TTL is the backstop.
      branchStatus.invalidate.mockRejectedValue(new Error('redis down'));
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.update(
        'branch-1',
        { status: BranchStatus.SUSPENDED },
        actor,
      );

      expect(result.status).toBe(BranchStatus.SUSPENDED);
    });

    it('is a no-op when status already matches, so saving the form does not 400', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.update(
        'branch-1',
        { status: BranchStatus.ACTIVE },
        actor,
      );

      expect(result.status).toBe(BranchStatus.ACTIVE);
      expect(branchStatus.invalidate).not.toHaveBeenCalled();
    });

    it('leaves other fields on the plain assign path', async () => {
      branchRepo.findOne.mockResolvedValue(
        branchStub({ status: BranchStatus.ACTIVE, isMainBranch: false }),
      );

      const result = await service.update('branch-1', { phone: '0900' }, actor);

      expect(result.phone).toBe('0900');
      expect(result.status).toBe(BranchStatus.ACTIVE);
      expect(branchStatus.invalidate).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // list / listMyBranches — the two pickers every branch dropdown is fed from
  // =========================================================================
  describe('list', () => {
    it('hides non-operating branches by default', async () => {
      branchRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, pageSize: 20 }, actor);

      const [args] = branchRepo.findAndCount.mock.calls[0];
      expect(args.where).toMatchObject({
        organizationId: 'org-1',
        status: BranchStatus.ACTIVE,
      });
    });

    it('includeInactive drops the status filter, so a store can be reopened', async () => {
      branchRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list({ page: 1, pageSize: 20, includeInactive: true }, actor);

      const [args] = branchRepo.findAndCount.mock.calls[0];
      expect(args.where).not.toHaveProperty('status');
    });
  });

  describe('listMyBranches', () => {
    it('excludes non-operating branches from every assignment', async () => {
      assignmentRepo.find.mockResolvedValue([
        { branchId: 'branch-1' },
        { branchId: 'branch-2' },
      ]);
      branchRepo.find.mockResolvedValue([]);

      await service.listMyBranches(actor);

      const [args] = branchRepo.find.mock.calls[0];
      expect(args.where).toHaveLength(2);
      for (const clause of args.where) {
        expect(clause).toMatchObject({
          organizationId: 'org-1',
          status: BranchStatus.ACTIVE,
        });
      }
    });
  });

  // =========================================================================
  // deactivationImpact
  // =========================================================================
  describe('deactivationImpact', () => {
    it('reports the main branch as a blocker, not a warning', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub({ isMainBranch: true }));

      const result = await service.deactivationImpact('branch-1', actor);

      expect(result.blockers.map((b) => b.code)).toEqual(['MAIN_BRANCH']);
      expect(result.isMainBranch).toBe(true);
    });

    it('has no blockers for an ordinary branch', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub({ isMainBranch: false }));

      const result = await service.deactivationImpact('branch-1', actor);

      expect(result.blockers).toEqual([]);
    });

    it('drops zero-count rows so the dialog only lists real obstacles', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub({ isMainBranch: false }));
      dataSource.query
        .mockResolvedValueOnce([{ count: 412 }]) // stock
        .mockResolvedValueOnce([{ count: 0 }])   // transfer orders
        .mockResolvedValueOnce([{ count: 0 }])   // pos sessions
        .mockResolvedValueOnce([{ count: 3 }])   // receivables
        .mockResolvedValueOnce([{ count: 0 }]);  // users only here

      const result = await service.deactivationImpact('branch-1', actor);

      expect(result.warnings.map((w) => [w.code, w.count])).toEqual([
        ['stock_balances', 412],
        ['receivables_open', 3],
      ]);
    });

    it('scopes every count to the actor organization', async () => {
      branchRepo.findOne.mockResolvedValue(branchStub({ isMainBranch: false }));

      await service.deactivationImpact('branch-1', actor);

      expect(dataSource.query).toHaveBeenCalledTimes(5);
      for (const [sql, params] of dataSource.query.mock.calls) {
        expect(sql).toContain('organization_id');
        expect(params[0]).toBe('org-1');
      }
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
