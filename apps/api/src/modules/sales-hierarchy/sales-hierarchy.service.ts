import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../events/event-publisher.service';
import { BranchEntity } from '../branch/branch.entity';
import { UserEntity } from '../auth/user.entity';
import { SalesmanAssignmentEntity } from './salesman-assignment.entity';
import { SalesManagerAssignmentEntity } from './sales-manager-assignment.entity';

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
    private readonly eventPublisher: EventPublisher,
  ) {}

  // ── Salesmen ──────────────────────────────────────────────

  async listSalesmen(
    branchId: string,
    actor: ActorContext,
  ): Promise<SalesmanAssignmentEntity[]> {
    await this.validateBranch(branchId, actor);
    return this.salesmanRepo.find({
      where: { branchId, organizationId: actor.organizationId },
      order: { assignedAt: 'DESC' },
    });
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

  async listSalesManagers(
    branchId: string,
    actor: ActorContext,
  ): Promise<SalesManagerAssignmentEntity[]> {
    await this.validateBranch(branchId, actor);
    return this.managerRepo.find({
      where: { branchId, organizationId: actor.organizationId },
      order: { assignedAt: 'DESC' },
    });
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
