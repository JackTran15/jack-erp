import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';
import { PromotionProgram } from '../domain/model/promotion-program';

/** Company-level CTKM authority (ADR-02). Without it, an actor manages only its active branch's own programs. */
export const PROMOTION_CHAIN_MANAGE_PERMISSION = 'promotion.chain.manage';

export type PromotionSearchScope = { kind: 'chain' } | { kind: 'branch'; branchId: string };

type OwnedProgram = Pick<PromotionProgram, 'id' | 'ownerBranchId' | 'branchIds'>;

/**
 * One actor's view of CTKM ownership — the access table of
 * 03-logical-design.md, cell for cell. Built by {@link PromotionAccessPolicy}
 * so the permission lookup happens once per request; every rule here is sync.
 */
export class PromotionAccess {
  constructor(
    readonly isChainManager: boolean,
    /** `actor.branchId` — the branch picked in the header switcher (A-04). */
    readonly activeBranchId: string | undefined,
  ) {}

  canRead(program: OwnedProgram): boolean {
    if (this.isChainManager) return true;
    if (!this.activeBranchId) return false;
    if (program.ownerBranchId !== undefined) return program.ownerBranchId === this.activeBranchId;
    return program.branchIds.length === 0 || program.branchIds.includes(this.activeBranchId);
  }

  canManage(program: OwnedProgram): boolean {
    if (this.isChainManager) return true;
    return this.activeBranchId !== undefined && program.ownerBranchId === this.activeBranchId;
  }

  /** ADR-06: a program the actor cannot see answers exactly like a missing one. */
  assertReadable(program: OwnedProgram): void {
    if (!this.canRead(program)) throw notFound(program.id);
  }

  assertManageable(program: OwnedProgram): void {
    this.assertReadable(program);
    if (!this.canManage(program)) {
      throw new ForbiddenException({ message: 'Chương trình do công ty quản lý', code: 'PROGRAM_NOT_MANAGEABLE' });
    }
  }

  /** Owner of a program this actor creates (A-03): chain manager → chain-owned; else the active branch. */
  ownerForNew(): string | undefined {
    if (this.isChainManager) return undefined;
    return this.requireActiveBranch();
  }

  searchScope(): PromotionSearchScope {
    if (this.isChainManager) return { kind: 'chain' };
    return { kind: 'branch', branchId: this.requireActiveBranch() };
  }

  private requireActiveBranch(): string {
    if (!this.activeBranchId) {
      throw new ForbiddenException({ message: 'Chưa chọn chi nhánh', code: 'NO_ACTIVE_BRANCH' });
    }
    return this.activeBranchId;
  }
}

/** ADR-04: a branch-owned program applies at exactly its owner, whatever the request said. */
export function scopeForOwner(ownerBranchId: string | undefined, requested: string[]): string[] {
  return ownerBranchId === undefined ? requested : [ownerBranchId];
}

function notFound(id: string | undefined): NotFoundException {
  return new NotFoundException(`Promotion program "${id}" not found`);
}

/**
 * Who may read / manage which CTKM (ADR-03). Decided here rather than in a
 * guard: the answer depends on the loaded program's owner, which no
 * decorator metadata can see.
 */
@Injectable()
export class PromotionAccessPolicy {
  constructor(private readonly rbac: RbacService) {}

  async forActor(actor: ActorContext): Promise<PromotionAccess> {
    const isChainManager = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      PROMOTION_CHAIN_MANAGE_PERMISSION,
    );
    return new PromotionAccess(isChainManager, actor.branchId);
  }
}
