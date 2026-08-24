import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DomainEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../events/event-publisher.service';
import { BranchEntity } from '../branch/branch.entity';
import { UserEntity } from '../auth/user.entity';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { employeeBranchScopeSqlNamed } from '../rbac/employee-branch-scope.service';
import { SalesmanAssignmentEntity } from './salesman-assignment.entity';
import { SalesManagerAssignmentEntity } from './sales-manager-assignment.entity';

/** Public-safe projection of an employee (never exposes salary or ID-card data). */
export interface PublicEmployee {
  id: string;
  userId: string;
  code: string;
  fullName: string;
  jobPosition: string | null;
  mobile: string | null;
}

@Injectable()
export class SalesHierarchyService {
  private readonly logger = new Logger(SalesHierarchyService.name);

  constructor(
    @InjectRepository(SalesmanAssignmentEntity)
    private readonly salesmanRepo: Repository<SalesmanAssignmentEntity>,
    @InjectRepository(SalesManagerAssignmentEntity)
    private readonly managerRepo: Repository<SalesManagerAssignmentEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly employeeRepo: Repository<EmployeeProfileEntity>,
    private readonly eventPublisher: EventPublisher,
  ) {}

  // ── Salesmen ──────────────────────────────────────────────

  /**
   * Salesmen of one branch: employees whose linked user account is assigned to it.
   *
   * The branch predicate keys on `u.id`, not `e.id` — `user_branch_assignments.user_id`
   * points at `users.id`, and keying on the profile id would match nothing and read on
   * screen as "this branch has no salespeople" rather than as a bug. Same shape as the
   * salesperson report filter, deliberately: both answer the same question.
   *
   * `branchId` used to gate access only, so the picker offered every employee in the
   * organization and a cashier in one store could book a sale against a colleague in
   * another. `salesman_assignments` is what assign/unassign writes, but nothing has ever
   * read it and it is empty in practice — scoping by it would hand back an empty list.
   */
  async listSalesmen(
    branchId: string,
    actor: ActorContext,
  ): Promise<PublicEmployee[]> {
    await this.validateBranch(branchId, actor);
    return this.listBranchEmployees(actor.organizationId, branchId);
  }

  async assignSalesman(
    branchId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<SalesmanAssignmentEntity> {
    await this.validateBranch(branchId, actor);
    await this.validateUser(userId, actor);

    const existing = await this.salesmanRepo.findOne({
      where: { userId, branchId },
    });
    if (existing) {
      throw new ConflictException(
        `User ${userId} is already assigned as salesman to branch ${branchId}`,
      );
    }

    const assignment = this.salesmanRepo.create({
      userId,
      branchId,
      organizationId: actor.organizationId,
      assignedBy: actor.userId,
    });

    const saved = await this.salesmanRepo.save(assignment);
    await this.publishAudit(DomainEventType.SALESMAN_ASSIGNED, { branchId, userId }, actor);
    return saved;
  }

  async unassignSalesman(
    branchId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.validateBranch(branchId, actor);

    const assignment = await this.salesmanRepo.findOne({
      where: { userId, branchId, organizationId: actor.organizationId },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Salesman assignment not found for user ${userId} in branch ${branchId}`,
      );
    }

    await this.salesmanRepo.remove(assignment);
    await this.publishAudit(DomainEventType.SALESMAN_UNASSIGNED, { branchId, userId }, actor);
  }

  // ── Sales Managers ────────────────────────────────────────

  /**
   * Sales managers of one branch — same scoping as {@link listSalesmen}.
   *
   * Not asked for, but not optional either: the two methods shared the org-wide helper,
   * so scoping one and leaving the other would have left a sibling pair with opposite
   * meanings behind identical names. Its only caller is the backoffice assignment screen,
   * whose empty state already reads "tại chi nhánh này".
   */
  async listSalesManagers(
    branchId: string,
    actor: ActorContext,
  ): Promise<PublicEmployee[]> {
    await this.validateBranch(branchId, actor);
    return this.listBranchEmployees(actor.organizationId, branchId);
  }

  async assignSalesManager(
    branchId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<SalesManagerAssignmentEntity> {
    await this.validateBranch(branchId, actor);
    await this.validateUser(userId, actor);

    const existing = await this.managerRepo.findOne({
      where: { userId, branchId },
    });
    if (existing) {
      throw new ConflictException(
        `User ${userId} is already assigned as sales manager to branch ${branchId}`,
      );
    }

    const assignment = this.managerRepo.create({
      userId,
      branchId,
      organizationId: actor.organizationId,
      assignedBy: actor.userId,
    });

    const saved = await this.managerRepo.save(assignment);
    await this.publishAudit(DomainEventType.SALES_MANAGER_ASSIGNED, { branchId, userId }, actor);
    return saved;
  }

  async unassignSalesManager(
    branchId: string,
    userId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.validateBranch(branchId, actor);

    const assignment = await this.managerRepo.findOne({
      where: { userId, branchId, organizationId: actor.organizationId },
    });
    if (!assignment) {
      throw new NotFoundException(
        `Sales manager assignment not found for user ${userId} in branch ${branchId}`,
      );
    }

    await this.managerRepo.remove(assignment);
    await this.publishAudit(DomainEventType.SALES_MANAGER_UNASSIGNED, { branchId, userId }, actor);
  }

  // ── Helpers ───────────────────────────────────────────────

  /**
   * Employees of one branch, projected to public-safe fields. The display name is taken
   * from each employee's linked user account; salary/ID-card fields are never exposed.
   */
  private async listBranchEmployees(
    organizationId: string,
    branchId: string,
  ): Promise<PublicEmployee[]> {
    // QueryBuilder rather than find(): the branch link lives on a third table and
    // FindOptionsWhere cannot carry the EXISTS. The join to `users` is what the
    // predicate keys on; the profile row itself has no usable branch column.
    const profiles = await this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.jobPosition', 'jobPosition')
      .innerJoin(UserEntity, 'u', 'u.id = e.userId')
      .where('e.organizationId = :organizationId', { organizationId })
      .andWhere(employeeBranchScopeSqlNamed('u.id'), { scopeBranchId: branchId })
      .orderBy('e.code', 'ASC')
      .getMany();
    if (profiles.length === 0) return [];

    const userIds = [...new Set(profiles.map((p) => p.userId))];
    const users = await this.userRepo.find({
      where: { id: In(userIds), organizationId },
      select: ['id', 'firstName', 'lastName'],
    });
    const nameMap = new Map<string, string>(
      users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]),
    );

    return profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      code: p.code,
      fullName: nameMap.get(p.userId) ?? '',
      jobPosition: p.jobPosition?.name ?? null,
      mobile: p.mobile ?? null,
    }));
  }

  private async validateBranch(
    branchId: string,
    actor: ActorContext,
  ): Promise<BranchEntity> {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, organizationId: actor.organizationId },
    });
    if (!branch) {
      throw new NotFoundException(
        `Branch ${branchId} not found in this organization`,
      );
    }
    return branch;
  }

  private async validateUser(
    userId: string,
    actor: ActorContext,
  ): Promise<UserEntity> {
    const user = await this.userRepo.findOne({
      where: { id: userId, organizationId: actor.organizationId },
    });
    if (!user) {
      throw new NotFoundException(
        `User ${userId} not found in this organization`,
      );
    }
    return user;
  }

  private async publishAudit(
    eventType: DomainEventType,
    payload: Record<string, unknown>,
    actor: ActorContext,
  ): Promise<void> {
    const correlationId = crypto.randomUUID();
    const event = {
      eventId: crypto.randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      organizationId: actor.organizationId,
      branchId: payload['branchId'] as string | undefined,
      correlationId,
      payload: {
        ...payload,
        performedBy: actor.userId,
      },
    };

    this.logger.log(JSON.stringify({ event: 'sales_hierarchy_audit', ...event }));

    try {
      await this.eventPublisher.publish('sales-hierarchy', event);
    } catch (err) {
      this.logger.warn(
        `Failed to publish audit event ${eventType}: ${(err as Error).message}`,
      );
    }
  }
}
