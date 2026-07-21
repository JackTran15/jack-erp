import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  DepositAuditAction,
  DepositAuditEntityType,
  DepositAuditLogEntity,
} from './deposit-audit-log.entity';

export interface RecordAuditInput {
  entityType: DepositAuditEntityType;
  entityId: string;
  action: DepositAuditAction;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export interface ListAuditQuery {
  entityType?: DepositAuditEntityType;
  entityId?: string;
  action?: DepositAuditAction;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/**
 * NFR-05 — append-only audit trail for the deposit-fund reconcile/lock module.
 * Owner of `deposit_audit_log`; DFR-02/DFR-05 write through here (they wrote
 * directly to the entity before this service existed, ahead of this ticket).
 */
@Injectable()
export class DepositAuditService {
  constructor(
    @InjectRepository(DepositAuditLogEntity)
    private readonly repo: Repository<DepositAuditLogEntity>,
  ) {}

  async record(
    input: RecordAuditInput,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(DepositAuditLogEntity) : this.repo;
    await repo.save(
      repo.create({
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        before: input.before,
        after: input.after,
        actorId: actor.userId,
        reason: input.reason,
      }),
    );
  }

  async list(
    query: ListAuditQuery,
    actor: ActorContext,
  ): Promise<{ data: DepositAuditLogEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.organizationId = :org', { org: actor.organizationId });
    if (actor.branchId) {
      qb.andWhere('(a.branchId = :branch OR a.branchId IS NULL)', { branch: actor.branchId });
    }
    if (query.entityType) qb.andWhere('a.entityType = :et', { et: query.entityType });
    if (query.entityId) qb.andWhere('a.entityId = :eid', { eid: query.entityId });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.dateFrom) qb.andWhere('a.createdAt >= :from', { from: query.dateFrom });
    if (query.dateTo) qb.andWhere('a.createdAt <= :to', { to: query.dateTo });

    const [data, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { data, total, page, pageSize };
  }
}
