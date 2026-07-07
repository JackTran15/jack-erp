import { PERMISSION_SEEDS } from '../../modules/rbac/permissions.seed';
import {
  BRANCH_MANAGER_PERMISSION_KEYS,
  GENERAL_MANAGER_PERMISSION_KEYS,
  STAFF_PERMISSION_KEYS,
  SYSTEM_ADMIN_PERMISSION_KEYS,
} from './org-role-permissions';

const OTHER_ISSUE_KEY = 'inventory.goods-issue.other-issue';
const DISPOSAL_KEY = 'inventory.goods-issue.disposal';

describe('goods-issue purpose permission seeds', () => {
  const seededKeys = PERMISSION_SEEDS.map((p) => p.key);

  it('registers both purpose permission keys in the catalogue', () => {
    expect(seededKeys).toContain(OTHER_ISSUE_KEY);
    expect(seededKeys).toContain(DISPOSAL_KEY);
  });

  it.each([
    ['SYSTEM_ADMIN', SYSTEM_ADMIN_PERMISSION_KEYS],
    ['GENERAL_MANAGER', GENERAL_MANAGER_PERMISSION_KEYS],
    ['BRANCH_MANAGER', BRANCH_MANAGER_PERMISSION_KEYS],
  ])('grants both purpose keys to %s', (_role, keys) => {
    expect(keys).toContain(OTHER_ISSUE_KEY);
    expect(keys).toContain(DISPOSAL_KEY);
  });

  it('does not grant the purpose keys to STAFF', () => {
    expect(STAFF_PERMISSION_KEYS).not.toContain(OTHER_ISSUE_KEY);
    expect(STAFF_PERMISSION_KEYS).not.toContain(DISPOSAL_KEY);
  });
});
