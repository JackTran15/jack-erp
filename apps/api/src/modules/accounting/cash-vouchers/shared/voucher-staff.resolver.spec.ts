import { Repository } from 'typeorm';
import { VoucherStaffResolver } from './voucher-staff.resolver';
import { UserEntity } from '../../../auth/user.entity';
import { EmployeeProfileEntity } from '../../../rbac/employee/employee-profile.entity';

const ORG = 'org-1';

function user(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    organizationId: ORG,
    firstName: 'Văn',
    lastName: 'Nguyễn',
    email: 'van@example.com',
    ...overrides,
  } as UserEntity;
}

/** Repositories stubbed down to `find`, mirroring what the resolver calls. */
function makeResolver(users: UserEntity[], profiles: EmployeeProfileEntity[] = []) {
  const userFind = jest.fn().mockResolvedValue(users);
  const profileFind = jest.fn().mockResolvedValue(profiles);
  const resolver = new VoucherStaffResolver(
    { find: userFind } as unknown as Repository<UserEntity>,
    { find: profileFind } as unknown as Repository<EmployeeProfileEntity>,
  );
  return { resolver, userFind, profileFind };
}

describe('VoucherStaffResolver.resolveOne', () => {
  it('resolves the code + display name for a single user id, calling userRepo.find once', async () => {
    const staff = user({ id: 'staff-1', firstName: 'Thu', lastName: 'Ngân' });
    const { resolver, userFind } = makeResolver([staff]);

    const result = await resolver.resolveOne('staff-1', ORG);

    expect(result).toEqual({ code: null, name: 'Thu Ngân' });
    expect(userFind).toHaveBeenCalledTimes(1);
    const [{ where }] = userFind.mock.calls[0];
    expect(where.organizationId).toBe(ORG);
    expect(where.id.value).toEqual(['staff-1']);
  });

  it('returns null without querying when the voucher names no staff', async () => {
    const { resolver, userFind } = makeResolver([]);

    const result = await resolver.resolveOne(null, ORG);

    expect(result).toBeNull();
    expect(userFind).not.toHaveBeenCalled();
  });

  it('returns null without throwing when the id does not resolve in the organization', async () => {
    const { resolver } = makeResolver([]);

    const result = await resolver.resolveOne('staff-1', ORG);

    expect(result).toBeNull();
  });
});
