import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { v4 as uuid } from 'uuid';
import {
  JournalStatus,
  JournalSource,
  DocumentType,
  DomainEventType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../../events/event-publisher.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { AccountEntity } from '../coa/account.entity';
import { JournalEntryEntity } from './journal-entry.entity';
import { JournalLineEntity } from './journal-line.entity';
import { PostJournalDto } from './dto';

export interface JournalListQuery {
  page?: number;
  pageSize?: number;
  source?: JournalSource;
  status?: JournalStatus;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);

  constructor(
    @InjectRepository(JournalEntryEntity)
    private readonly entryRepo: Repository<JournalEntryEntity>,
    @InjectRepository(JournalLineEntity)
    private readonly lineRepo: Repository<JournalLineEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
    private readonly eventPublisher: EventPublisher,
    private readonly documentNumberingService: DocumentNumberingService,
  ) {}

  async post(
    dto: PostJournalDto,
    actor: ActorContext,
  ): Promise<JournalEntryEntity> {
    await this.validateAccounts(dto, actor);
    this.validateBalance(dto);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.JOURNAL,
      actor.branchId,
      actor,
    );

    const now = new Date();

    const entry = await this.dataSource.transaction(async (manager) => {
      const journalEntry = manager.create(JournalEntryEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber,
        source: dto.source,
        sourceReferenceId: dto.sourceReferenceId,
        description: dto.description,
        notes: dto.notes,
        status: JournalStatus.POSTED,
        postedAt: now,
        postedBy: actor.userId,
      });

      const savedEntry = await manager.save(journalEntry);

      const lines = dto.lines.map((line) =>
        manager.create(JournalLineEntity, {
          journalEntryId: savedEntry.id,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          accountId: line.accountId,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          description: line.description,
          lineOrder: line.lineOrder,
        }),
      );

      savedEntry.lines = await manager.save(lines);
      return savedEntry;
    });

    await this.eventPublisher.publish('erp.journal.posted', {
      eventId: uuid(),
      eventType: DomainEventType.JOURNAL_POSTED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      correlationId: uuid(),
      payload: {
        journalEntryId: entry.id,
        documentNumber: entry.documentNumber,
        source: entry.source,
        sourceReferenceId: entry.sourceReferenceId,
        actorId: actor.userId,
      },
    });

    this.logger.log(
      `Posted journal ${entry.documentNumber} (id=${entry.id}, org=${actor.organizationId})`,
    );

    return entry;
  }

  async reverse(
    journalId: string,
    reason: string,
    actor: ActorContext,
  ): Promise<JournalEntryEntity> {
    const original = await this.entryRepo.findOne({
      where: { id: journalId, organizationId: actor.organizationId },
      relations: ['lines'],
    });

    if (!original) {
      throw new NotFoundException(`Journal entry ${journalId} not found`);
    }

    if (original.status !== JournalStatus.POSTED) {
      throw new BadRequestException(
        `Journal ${journalId} is not in POSTED status`,
      );
    }

    if (original.reversedByJournalId) {
      throw new BadRequestException(
        `Journal ${journalId} has already been reversed`,
      );
    }

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.JOURNAL,
      actor.branchId,
      actor,
    );

    const now = new Date();

    const reversal = await this.dataSource.transaction(async (manager) => {
      const reversalEntry = manager.create(JournalEntryEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        documentNumber,
        source: original.source,
        sourceReferenceId: original.sourceReferenceId,
        description: `Reversal of ${original.documentNumber}: ${reason}`,
        notes: reason,
        status: JournalStatus.POSTED,
        postedAt: now,
        postedBy: actor.userId,
        reversalOfJournalId: original.id,
      });

      const savedReversal = await manager.save(reversalEntry);

      const reversedLines = original.lines.map((line, idx) =>
        manager.create(JournalLineEntity, {
          journalEntryId: savedReversal.id,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          accountId: line.accountId,
          debitAmount: line.creditAmount,
          creditAmount: line.debitAmount,
          description: line.description
            ? `Reversal: ${line.description}`
            : 'Reversal',
          lineOrder: idx + 1,
        }),
      );

      savedReversal.lines = await manager.save(reversedLines);

      original.status = JournalStatus.REVERSED;
      original.reversedByJournalId = savedReversal.id;
      await manager.save(original);

      return savedReversal;
    });

    await this.eventPublisher.publish('erp.journal.reversed', {
      eventId: uuid(),
      eventType: DomainEventType.JOURNAL_REVERSED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      correlationId: uuid(),
      payload: {
        reversalJournalId: reversal.id,
        originalJournalId: original.id,
        reason,
        actorId: actor.userId,
      },
    });

    this.logger.log(
      `Reversed journal ${original.documentNumber} → ${reversal.documentNumber} (org=${actor.organizationId})`,
    );

    return reversal;
  }

  async list(
    query: JournalListQuery,
    actor: ActorContext,
  ): Promise<{ data: JournalEntryEntity[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb: SelectQueryBuilder<JournalEntryEntity> = this.entryRepo
      .createQueryBuilder('je')
      .where('je.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.source) {
      qb.andWhere('je.source = :source', { source: query.source });
    }
    if (query.status) {
      qb.andWhere('je.status = :status', { status: query.status });
    }
    if (query.branchId) {
      qb.andWhere('je.branchId = :branchId', { branchId: query.branchId });
    }
    if (query.dateFrom) {
      qb.andWhere('je.postedAt >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('je.postedAt <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('je.postedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, pageSize };
  }

  async getById(
    id: string,
    actor: ActorContext,
  ): Promise<JournalEntryEntity> {
    const entry = await this.entryRepo.findOne({
      where: { id, organizationId: actor.organizationId },
      relations: ['lines'],
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry ${id} not found`);
    }

    return entry;
  }

  private async validateAccounts(
    dto: PostJournalDto,
    actor: ActorContext,
  ): Promise<void> {
    const accountIds = [...new Set(dto.lines.map((l) => l.accountId))];

    const accounts = await this.accountRepo
      .createQueryBuilder('a')
      .where('a.id IN (:...ids)', { ids: accountIds })
      .andWhere('a.organizationId = :orgId', { orgId: actor.organizationId })
      .getMany();

    const foundIds = new Set(accounts.map((a) => a.id));

    for (const id of accountIds) {
      if (!foundIds.has(id)) {
        throw new BadRequestException(`Account ${id} not found`);
      }
    }

    const inactiveAccounts = accounts.filter((a) => !a.isActive);
    if (inactiveAccounts.length > 0) {
      const codes = inactiveAccounts.map((a) => a.code).join(', ');
      throw new BadRequestException(
        `Cannot post to inactive account(s): ${codes}`,
      );
    }
  }

  private validateBalance(dto: PostJournalDto): void {
    const totalDebits = dto.lines.reduce(
      (sum, l) => sum + Number(l.debitAmount),
      0,
    );
    const totalCredits = dto.lines.reduce(
      (sum, l) => sum + Number(l.creditAmount),
      0,
    );

    const diff = Math.abs(totalDebits - totalCredits);
    if (diff > 0.001) {
      throw new BadRequestException(
        `Journal is not balanced: total debits (${totalDebits}) != total credits (${totalCredits})`,
      );
    }
  }
}
