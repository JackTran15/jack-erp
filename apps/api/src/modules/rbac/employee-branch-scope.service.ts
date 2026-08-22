import { Injectable, Logger } from '@nestjs/common';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { RbacService } from './rbac.service';

/** Bypass key: the holder sees every employee in the organization. */
const READ_ALL_PERMISSION = 'iam.user.read.all';

/**
 * How wide an employee picker may look for one request.
 *
 * A discriminated union rather than `branchId: string | undefined`, because
 * "unrestricted" and "no branch at all" are opposite outcomes that a bare
 * undefined cannot tell apart — and each caller would have to re-derive the
 * difference from the permission set.
 */
export type EmployeeScope =
  | { mode: 'all' }
  | { mode: 'branch'; branchId: string }
  | { mode: 'none' };

/**
 * The scope predicate, shared as SQL text rather than as a resolved id list.
 *
 * Pre-loading the ids would add a round-trip per keystroke and bind a list that
 * grows with headcount — the very thing that made these pickers unusable. Both
 * builders emit the same EXISTS shape; they differ only in how the branch
 * parameter is spelled, because TypeORM binds by name and raw SQL by position.
 */
function scopePredicate(userIdExpr: string, branchParam: string): string {
  return (
    `EXISTS (SELECT 1 FROM user_branch_assignments uba` +
    ` WHERE uba.user_id = ${userIdExpr} AND uba.branch_id = ${branchParam})`
  );
}

/**
 * Predicate for TypeORM QueryBuilder callers.
 *
 * @param userIdExpr the users-table id expression in the caller's query, e.g. `u.id`
 * @param branchParam name of the bound parameter, without the leading colon
 */
export function employeeBranchScopeSqlNamed(
  userIdExpr: string,
  branchParam = 'scopeBranchId',
): string {
  return scopePredicate(userIdExpr, `:${branchParam}`);
}

/**
 * Predicate for raw-SQL callers.
 *
 * Takes an already-rendered placeholder (`'$3::uuid'`) rather than an index:
 * only the caller knows how many parameters precede it, and building the
 * fragment and the parameter array apart is what breaks the unrelated lookup
 * types. The `::uuid` cast is the caller's responsibility and is not optional —
 * parameters arrive as text while `user_branch_assignments.branch_id` is uuid.
 */
export function employeeBranchScopeSqlPositional(
  userIdExpr: string,
  branchPlaceholder: string,
): string {
  return scopePredicate(userIdExpr, branchPlaceholder);
}

/**
 * Answers "which branch does this document belong to" for every employee picker
 * (party pickers on stock and cash vouchers, cashier / salesperson report
 * filters). Scope is the *active* branch — `ActorContext.branchId` — so a user
 * assigned to several branches sees only the one they are working in.
 *
 * Not to be confused with {@link UsersService.visibleUserIds}, which answers
 * "which accounts may I manage": that one spans every branch the actor belongs
 * to plus the accounts above them, and is correct for the employee admin list.
 * Merging the two would break one screen or the other.
 */
@Injectable()
export class EmployeeBranchScopeService {
  private readonly logger = new Logger(EmployeeBranchScopeService.name);

  constructor(private readonly rbacService: RbacService) {}

  async resolve(actor: ActorContext): Promise<EmployeeScope> {
    const keys = await this.rbacService.getUserPermissions(
      actor.userId,
      actor.organizationId,
    );

    let scope: EmployeeScope;
    if (keys.includes(READ_ALL_PERMISSION)) {
      scope = { mode: 'all' };
    } else if (!actor.branchId) {
      // Fail closed. An actor with no resolvable branch is a configuration gap,
      // not a reason to hand back the whole organization.
      scope = { mode: 'none' };
    } else {
      scope = { mode: 'branch', branchId: actor.branchId };
    }

    // "filtered correctly" and "empty because nobody is assigned to this branch"
    // look identical on screen; this line is what tells them apart in a log.
    this.logger.debug(
      `Employee scope for user=${actor.userId}: mode=${scope.mode}` +
        (scope.mode === 'branch' ? ` branch=${scope.branchId}` : ''),
    );
    return scope;
  }
}
