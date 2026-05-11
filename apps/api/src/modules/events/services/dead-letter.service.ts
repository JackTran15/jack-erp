import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { DeadLetterStatus, DomainEvent } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../event-publisher.service';
import { DeadLetterEventEntity } from '../entities/dead-letter-event.entity';

export interface RecordDeadLetterInput {
  topic: string;
  partition?: number;
  offset?: string;
  key?: string;
  payload: Record<string, unknown>;
  error?: string;
  organizationId: string;
  branchId?: string;
}

export interface ListDeadLetterQuery {
  page?: number;
  pageSize?: number;
  status?: DeadLetterStatus;
  topic?: string;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectRepository(DeadLetterEventEntity)
    private readonly repo: Repository<DeadLetterEventEntity>,
    private readonly publisher: EventPublisher,
  ) {}

  async record(input: RecordDeadLetterInput): Promise<DeadLetterEventEntity> {
    const entity = this.repo.create({
      topic: input.topic,
      partition: input.partition,
      offset: input.offset,
      key: input.key,
      payload: input.payload,
      error: input.error,
      retryCount: 3,
      status: DeadLetterStatus.PENDING,
      organizationId: input.organizationId,
      branchId: input.branchId,
    });

    const saved = await this.repo.save(entity);
    this.logger.error(
      `Recorded dead letter event id=${saved.id} topic=${saved.topic} error=${saved.error}`,
    );
    return saved;
  }

  async list(
    query: ListDeadLetterQuery,
    actor: ActorContext,
  ): Promise<{
    data: DeadLetterEventEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb: SelectQueryBuilder<DeadLetterEventEntity> = this.repo
      .createQueryBuilder('dle')
      .where('dle.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.status) {
      qb.andWhere('dle.status = :status', { status: query.status });
    }
    if (query.topic) {
      qb.andWhere('dle.topic = :topic', { topic: query.topic });
    }

    qb.orderBy('dle.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<DeadLetterEventEntity> {
    const row = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!row) throw new NotFoundException(`Dead letter event ${id} not found`);
    return row;
  }

  async replay(id: string, actor: ActorContext): Promise<DeadLetterEventEntity> {
    const row = await this.getById(id, actor);

    if (row.status !== DeadLetterStatus.PENDING) {
      throw new BadRequestException(
        `Cannot replay event in status ${row.status}`,
      );
    }

    const event = row.payload as unknown as DomainEvent<unknown>;
    await this.publisher.publish(row.topic, event, row.key);

    row.status = DeadLetterStatus.RESOLVED;
    row.resolvedBy = actor.userId;
    row.resolvedAt = new Date();
    const saved = await this.repo.save(row);

    this.logger.log(
      `Replayed dead letter event ${id} to topic ${row.topic} by user ${actor.userId}`,
    );
    return saved;
  }

  async ignore(
    id: string,
    reason: string | undefined,
    actor: ActorContext,
  ): Promise<DeadLetterEventEntity> {
    const row = await this.getById(id, actor);

    if (row.status !== DeadLetterStatus.PENDING) {
      throw new BadRequestException(
        `Cannot ignore event in status ${row.status}`,
      );
    }

    row.status = DeadLetterStatus.IGNORED;
    row.resolvedBy = actor.userId;
    row.resolvedAt = new Date();
    row.notes = reason;
    const saved = await this.repo.save(row);

    this.logger.log(
      `Ignored dead letter event ${id} by user ${actor.userId}: ${reason ?? '(no reason)'}`,
    );
    return saved;
  }
}
