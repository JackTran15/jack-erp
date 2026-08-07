import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { RbacService } from './rbac.service';

/**
 * The guard gained the ability to accept several permission keys (OR) so one
 * endpoint can serve the back office and the till under different key
 * namespaces. The single-string form is by far the more common one — several
 * hundred call sites — so most of what these tests defend is that widening
 * the contract did not change it.
 */
describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let rbacService: { hasAnyPermission: jest.Mock };

  const contextFor = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const ACTOR = { userId: 'user-1', organizationId: 'org-1' };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    rbacService = { hasAnyPermission: jest.fn().mockResolvedValue(true) };
    guard = new PermissionGuard(
      reflector as unknown as Reflector,
      rbacService as unknown as RbacService,
    );
  });

  it('allows the request when no permission is declared', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextFor(ACTOR))).resolves.toBe(true);
    expect(rbacService.hasAnyPermission).not.toHaveBeenCalled();
  });

  it('normalises a single declared key into a one-element list', async () => {
    reflector.getAllAndOverride.mockReturnValue('customer.read');

    await expect(guard.canActivate(contextFor(ACTOR))).resolves.toBe(true);
    expect(rbacService.hasAnyPermission).toHaveBeenCalledWith('user-1', 'org-1', [
      'customer.read',
    ]);
  });

  it('passes a declared list through unchanged', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'promotion.read',
      'pos.promotion.evaluate',
    ]);

    await expect(guard.canActivate(contextFor(ACTOR))).resolves.toBe(true);
    expect(rbacService.hasAnyPermission).toHaveBeenCalledWith('user-1', 'org-1', [
      'promotion.read',
      'pos.promotion.evaluate',
    ]);
  });

  it('denies and names every accepted key when the user holds none', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'promotion.read',
      'pos.promotion.evaluate',
    ]);
    rbacService.hasAnyPermission.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor(ACTOR))).rejects.toThrow(
      new ForbiddenException(
        'Missing required permission: promotion.read or pos.promotion.evaluate',
      ),
    );
  });

  it('rejects a request with no authentication context', async () => {
    reflector.getAllAndOverride.mockReturnValue('customer.read');

    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(
      ForbiddenException,
    );
    expect(rbacService.hasAnyPermission).not.toHaveBeenCalled();
  });
});
