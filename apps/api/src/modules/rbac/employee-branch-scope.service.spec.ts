import { Test, TestingModule } from '@nestjs/testing';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from './rbac.service';
import {
  EmployeeBranchScopeService,
  employeeBranchScopeSqlNamed,
  employeeBranchScopeSqlPositional,
} from './employee-branch-scope.service';

const BRANCH_HN = '11111111-1111-1111-1111-111111111111';

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: BRANCH_HN,
    branchIds: [BRANCH_HN],
    roles: [],
    ...overrides,
  };
}

describe('EmployeeBranchScopeService', () => {
  let service: EmployeeBranchScopeService;
  let rbacService: { getUserPermissions: jest.Mock };

  beforeEach(async () => {
    rbacService = { getUserPermissions: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeBranchScopeService,
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = module.get(EmployeeBranchScopeService);
  });

  describe('resolve', () => {
    it('returns mode "all" for a holder of iam.user.read.all, active branch or not', async () => {
      rbacService.getUserPermissions.mockResolvedValue([
        'inventory.read',
        'iam.user.read.all',
      ]);

      await expect(service.resolve(actor())).resolves.toEqual({ mode: 'all' });
      await expect(
        service.resolve(actor({ branchId: undefined, branchIds: [] })),
      ).resolves.toEqual({ mode: 'all' });
    });

    // AC-12 — fail closed. The whole point of the union: no branch must mean
    // "nothing", never "everything".
    it('returns mode "none" when no branch resolves and the bypass is absent', async () => {
      await expect(
        service.resolve(actor({ branchId: undefined, branchIds: [] })),
      ).resolves.toEqual({ mode: 'none' });
    });

    it('returns mode "branch" pinned to the active branch', async () => {
      await expect(service.resolve(actor())).resolves.toEqual({
        mode: 'branch',
        branchId: BRANCH_HN,
      });
    });

    it('scopes to the active branch even when the actor belongs to several', async () => {
      const other = '22222222-2222-2222-2222-222222222222';

      await expect(
        service.resolve(actor({ branchIds: [BRANCH_HN, other] })),
      ).resolves.toEqual({ mode: 'branch', branchId: BRANCH_HN });
    });

    it('reads the permission set exactly once per call', async () => {
      await service.resolve(actor());

      expect(rbacService.getUserPermissions).toHaveBeenCalledTimes(1);
      expect(rbacService.getUserPermissions).toHaveBeenCalledWith(
        'user-1',
        'org-1',
      );
    });
  });

  describe('predicate builders', () => {
    it('builds the named-parameter form around the caller id expression', () => {
      expect(employeeBranchScopeSqlNamed('u.id')).toBe(
        'EXISTS (SELECT 1 FROM user_branch_assignments uba' +
          ' WHERE uba.user_id = u.id AND uba.branch_id = :scopeBranchId)',
      );
    });

    it('honours a custom named parameter', () => {
      expect(employeeBranchScopeSqlNamed('users.id', 'branchScope')).toBe(
        'EXISTS (SELECT 1 FROM user_branch_assignments uba' +
          ' WHERE uba.user_id = users.id AND uba.branch_id = :branchScope)',
      );
    });

    it('builds the positional form from a rendered placeholder', () => {
      expect(employeeBranchScopeSqlPositional('u.id', '$3::uuid')).toBe(
        'EXISTS (SELECT 1 FROM user_branch_assignments uba' +
          ' WHERE uba.user_id = u.id AND uba.branch_id = $3::uuid)',
      );
    });

    it('emits the same shape in both forms', () => {
      expect(employeeBranchScopeSqlPositional('u.id', ':scopeBranchId')).toBe(
        employeeBranchScopeSqlNamed('u.id'),
      );
    });
  });
});
