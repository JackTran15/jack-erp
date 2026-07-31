import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CrudEntityConfig } from '@erp/shared-interfaces';
import { RbacService } from '../rbac/rbac.service';
import { CrudPermissionGuard } from './crud-permission.guard';
import { EntityRegistryService } from './entity-registry.service';

const ACTOR = { userId: 'u1', organizationId: 'org1' };

const CONFIG = {
  entityKey: 'products',
  permissions: {
    read: 'product.read',
    create: 'product.write',
    update: 'product.write',
    delete: 'product.write',
  },
} as unknown as CrudEntityConfig;

const buildContext = (
  method: string,
  params: Record<string, string>,
  user: unknown = ACTOR,
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, params, user }) }),
  }) as unknown as ExecutionContext;

describe('CrudPermissionGuard', () => {
  let granted: string[];
  let guard: CrudPermissionGuard;

  beforeEach(() => {
    granted = ['product.read'];
    const registry = {
      getEntityConfig: (key: string) => (key === 'products' ? CONFIG : null),
    } as unknown as EntityRegistryService;
    const rbac = {
      hasPermission: async (_u: string, _o: string, key: string) =>
        granted.includes(key),
    } as unknown as RbacService;
    guard = new CrudPermissionGuard(registry, rbac);
  });

  it('allows a read when the actor holds the entity read permission', async () => {
    await expect(
      guard.canActivate(buildContext('GET', { entityKey: 'products' })),
    ).resolves.toBe(true);
  });

  it.each([
    ['POST', 'create'],
    ['PATCH', 'update'],
    ['DELETE', 'delete'],
  ])('denies %s when the actor only holds read', async (method) => {
    await expect(
      guard.canActivate(buildContext(method, { entityKey: 'products' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a write once the actor holds the write permission', async () => {
    granted.push('product.write');
    await expect(
      guard.canActivate(buildContext('POST', { entityKey: 'products' })),
    ).resolves.toBe(true);
  });

  it('stays open for the registry listing (no entityKey param)', async () => {
    await expect(guard.canActivate(buildContext('GET', {}))).resolves.toBe(true);
  });

  it('falls through on an unknown entity so the controller answers 404', async () => {
    await expect(
      guard.canActivate(buildContext('GET', { entityKey: 'nope' })),
    ).resolves.toBe(true);
  });

  it('rejects a request without an authentication context', async () => {
    await expect(
      guard.canActivate(buildContext('GET', { entityKey: 'products' }, null)),
    ).rejects.toThrow(ForbiddenException);
  });
});
