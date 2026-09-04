import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { REPORT_PERMISSION_KEYS } from '@erp/shared-interfaces';
import { RbacService } from '../../rbac/rbac.service';
import { ReportPermissionGuard } from './report-permission.guard';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const user = { userId: 'u1', organizationId: 'org-1' };

function build(granted = false) {
  const rbac = {
    hasPermission: jest.fn(async () => granted),
  } as unknown as RbacService;
  return { guard: new ReportPermissionGuard(rbac), rbac };
}

describe('ReportPermissionGuard', () => {
  it('resolves the permission from a reportType in the body', async () => {
    const { guard, rbac } = build(true);

    await expect(
      guard.canActivate(
        context({ user, body: { reportType: 'inventory-stock-summary' } }),
      ),
    ).resolves.toBe(true);
    expect(rbac.hasPermission).toHaveBeenCalledWith(
      'u1',
      'org-1',
      REPORT_PERMISSION_KEYS['inventory-stock-summary'],
    );
  });

  it('resolves it from the query string too (GET /columns?reportType=)', async () => {
    const { guard, rbac } = build(true);

    await guard.canActivate(
      context({ user, query: { reportType: 'customer-debts' } }),
    );
    expect(rbac.hasPermission).toHaveBeenCalledWith(
      'u1',
      'org-1',
      REPORT_PERMISSION_KEYS['customer-debts'],
    );
  });

  it('403s with the missing key named', async () => {
    const { guard } = build(false);

    await expect(
      guard.canActivate(context({ user, body: { reportType: 'business-results' } })),
    ).rejects.toThrow(
      `Missing required permission: ${REPORT_PERMISSION_KEYS['business-results']}`,
    );
  });

  it('lets an unknown report type through so the controller can 400/404 it', async () => {
    const { guard, rbac } = build(false);

    await expect(
      guard.canActivate(context({ user, body: { reportType: 'not-a-report' } })),
    ).resolves.toBe(true);
    expect(rbac.hasPermission).not.toHaveBeenCalled();
  });

  it('ignores a request with no reportType — those routes keep the group key', async () => {
    const { guard, rbac } = build(false);

    await expect(
      guard.canActivate(context({ user, query: { type: 'store' } })),
    ).resolves.toBe(true);
    expect(rbac.hasPermission).not.toHaveBeenCalled();
  });

  it('refuses a request with no authentication context', async () => {
    const { guard } = build(true);

    await expect(
      guard.canActivate(context({ body: { reportType: 'revenue-by-item' } })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('covers every report the frontend can ask for', () => {
    // A report key with no permission would fall through the guard and be
    // readable by anyone holding the group key — the exact thing this replaces.
    for (const [reportKey, permission] of Object.entries(
      REPORT_PERMISSION_KEYS,
    )) {
      expect(permission).toMatch(/^reporting\.[a-z]+\.[a-z0-9-]+\.read$/);
      expect(reportKey).not.toHaveLength(0);
    }
  });
});
