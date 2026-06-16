import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Actor, ActorContext } from './actor-context.decorator';

// Extract the factory passed to createParamDecorator so it can be invoked directly.
function getActorFactory(): (
  data: unknown,
  ctx: ExecutionContext,
) => ActorContext {
  class Probe {
    handler(@Actor() _actor: ActorContext): void {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler');
  return args[Object.keys(args)[0]].factory;
}

function contextFor(user: unknown, headerBranchId?: string): ExecutionContext {
  const request = {
    user,
    headers: headerBranchId ? { 'x-branch-id': headerBranchId } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('@Actor() branch resolution', () => {
  const factory = getActorFactory();

  it('prefers the active branch from the JWT over the header', () => {
    const ctx = contextFor(
      {
        userId: 'user-1',
        organizationId: 'org-1',
        roles: ['admin'],
        branchIds: ['branch-1', 'branch-2'],
        branchId: 'branch-2',
      },
      'branch-1',
    );

    expect(factory(undefined, ctx).branchId).toBe('branch-2');
  });

  it('falls back to a validated X-Branch-Id header when the JWT has no active branch', () => {
    const ctx = contextFor(
      {
        userId: 'user-1',
        organizationId: 'org-1',
        roles: ['admin'],
        branchIds: ['branch-1', 'branch-2'],
      },
      'branch-2',
    );

    expect(factory(undefined, ctx).branchId).toBe('branch-2');
  });

  it('ignores a header branch outside the assigned branches and uses the first assigned branch', () => {
    const ctx = contextFor(
      {
        userId: 'user-1',
        organizationId: 'org-1',
        roles: ['admin'],
        branchIds: ['branch-1', 'branch-2'],
      },
      'branch-9',
    );

    expect(factory(undefined, ctx).branchId).toBe('branch-1');
  });
});
