import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { DocumentType, PaginationQuery, PaginatedResponse } from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from './document-number-rule.entity';
import { DocumentNumberCounterEntity } from './document-number-counter.entity';
import {
  CreateDocumentNumberRuleDto,
  UpdateDocumentNumberRuleDto,
} from './dto';

@Injectable()
export class DocumentNumberingService {
  private readonly logger = new Logger(DocumentNumberingService.name);

  constructor(
    @InjectRepository(DocumentNumberRuleEntity)
    private readonly ruleRepo: Repository<DocumentNumberRuleEntity>,
    @InjectRepository(DocumentNumberCounterEntity)
    private readonly counterRepo: Repository<DocumentNumberCounterEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createRule(
    dto: CreateDocumentNumberRuleDto,
    actor: ActorContext,
  ): Promise<DocumentNumberRuleEntity> {
    const existing = await this.ruleRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        branchId: dto.branchId ?? IsNull(),
        documentType: dto.documentType,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        `An active rule already exists for this scope and document type. ` +
          `Deactivate the existing rule first or create an inactive one.`,
      );
    }

    const rule = this.ruleRepo.create({
      ...dto,
      organizationId: actor.organizationId,
      branchId: dto.branchId ?? undefined,
      createdBy: actor.userId,
      isActive: true,
    });

    return this.ruleRepo.save(rule);
  }

  async updateRule(
    id: string,
    dto: UpdateDocumentNumberRuleDto,
    actor: ActorContext,
  ): Promise<DocumentNumberRuleEntity> {
    const rule = await this.findRuleOrFail(id, actor);
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async activateRule(
    id: string,
    actor: ActorContext,
  ): Promise<DocumentNumberRuleEntity> {
    const rule = await this.findRuleOrFail(id, actor);

    if (rule.isActive) {
      return rule;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        DocumentNumberRuleEntity,
        {
          organizationId: actor.organizationId,
          branchId: rule.branchId ?? IsNull(),
          documentType: rule.documentType,
          isActive: true,
        },
        { isActive: false },
      );

      rule.isActive = true;
      await manager.save(rule);
    });

    return rule;
  }

  async deactivateRule(
    id: string,
    actor: ActorContext,
  ): Promise<DocumentNumberRuleEntity> {
    const rule = await this.findRuleOrFail(id, actor);
    rule.isActive = false;
    return this.ruleRepo.save(rule);
  }

  async listRules(
    query: PaginationQuery & { documentType?: DocumentType; branchId?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<DocumentNumberRuleEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };

    if (query.documentType) {
      where.documentType = query.documentType;
    }
    if (query.branchId !== undefined) {
      where.branchId = query.branchId || IsNull();
    }

    const [data, total] = await this.ruleRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async generate(
    documentType: DocumentType,
    branchId: string | undefined,
    actor: ActorContext,
  ): Promise<string> {
    let rule = await this.resolveActiveRule(
      documentType,
      branchId,
      actor.organizationId,
    );

    if (!rule) {
      rule = await this.ensureDefaultActiveRule(documentType, actor);
    }

    if (!rule) {
      throw new BadRequestException(
        `Không thể khởi tạo quy tắc đánh số mặc định cho loại ${documentType}. Vui lòng thử lại hoặc cấu hình document numbering thủ công.`,
      );
    }

    const now = new Date();
    const resetKey = this.computeResetKey(rule.resetPolicy, now);
    const nextValue = await this.atomicIncrement(rule, resetKey, actor);

    return this.formatDocumentNumber(rule, now, nextValue);
  }

  private async resolveActiveRule(
    documentType: DocumentType,
    branchId: string | undefined,
    organizationId: string,
  ): Promise<DocumentNumberRuleEntity | null> {
    if (branchId) {
      const branchRule = await this.ruleRepo.findOne({
        where: {
          organizationId,
          branchId,
          documentType,
          isActive: true,
        },
      });
      if (branchRule) return branchRule;
    }

    return this.ruleRepo.findOne({
      where: {
        organizationId,
        branchId: IsNull(),
        documentType,
        isActive: true,
      },
    });
  }

  private async ensureDefaultActiveRule(
    documentType: DocumentType,
    actor: ActorContext,
  ): Promise<DocumentNumberRuleEntity | null> {
    const defaultRule = this.ruleRepo.create({
      organizationId: actor.organizationId,
      branchId: undefined,
      documentType,
      prefix: this.getDefaultPrefix(documentType),
      suffix: undefined,
      includeDate: true,
      dateFormat: 'YYYYMM',
      sequenceLength: 5,
      resetPolicy: ResetPolicy.MONTHLY,
      isActive: true,
      createdBy: actor.userId,
    });

    try {
      const savedRule = await this.ruleRepo.save(defaultRule);
      this.logger.warn(
        `Auto-created default numbering rule for ${documentType} in organization ${actor.organizationId}`,
      );
      return savedRule;
    } catch (error) {
      this.logger.warn(
        `Failed to auto-create default rule for ${documentType}, re-checking active rule`,
      );
      return this.resolveActiveRule(
        documentType,
        undefined,
        actor.organizationId,
      );
    }
  }

  private getDefaultPrefix(documentType: DocumentType): string {
    const prefixMap: Record<DocumentType, string> = {
      [DocumentType.INVOICE]: 'INV',
      [DocumentType.SALE]: 'SAL',
      [DocumentType.RETURN]: 'RTN',
      [DocumentType.TRANSFER]: 'TRF',
      [DocumentType.ADJUSTMENT]: 'ADJ',
      [DocumentType.JOURNAL]: 'JNL',
      [DocumentType.PAYABLE]: 'PAY',
      [DocumentType.RECEIVABLE]: 'REC',
      [DocumentType.PURCHASE_ORDER]: 'PO',
      [DocumentType.GOODS_ISSUE]: 'GI',
    };

    return prefixMap[documentType];
  }

  private computeResetKey(policy: ResetPolicy, now: Date): string {
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');

    switch (policy) {
      case ResetPolicy.DAILY:
        return `${year}-${month}-${day}`;
      case ResetPolicy.MONTHLY:
        return `${year}-${month}`;
      case ResetPolicy.YEARLY:
        return year;
      case ResetPolicy.NEVER:
        return 'NEVER';
    }
  }

  /**
   * Atomically increment the counter using SELECT FOR UPDATE to prevent
   * race conditions. If no counter exists for the resetKey, create one
   * starting at 1.
   */
  private async atomicIncrement(
    rule: DocumentNumberRuleEntity,
    resetKey: string,
    actor: ActorContext,
  ): Promise<number> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const counterRepo = manager.getRepository(DocumentNumberCounterEntity);

      let counter = await counterRepo.findOne({
        where: { ruleId: rule.id, resetKey },
        lock: { mode: 'pessimistic_write' },
      });

      if (!counter) {
        counter = counterRepo.create({
          ruleId: rule.id,
          organizationId: actor.organizationId,
          branchId: rule.branchId,
          resetKey,
          currentValue: 1,
        });
        await counterRepo.save(counter);
        return 1;
      }

      counter.currentValue = Number(counter.currentValue) + 1;
      await counterRepo.save(counter);
      return counter.currentValue;
    });
  }

  private formatDocumentNumber(
    rule: DocumentNumberRuleEntity,
    now: Date,
    sequence: number,
  ): string {
    const parts: string[] = [rule.prefix];

    if (rule.includeDate) {
      parts.push(this.formatDate(rule.dateFormat, now));
    }

    parts.push(sequence.toString().padStart(rule.sequenceLength, '0'));

    if (rule.suffix) {
      parts.push(rule.suffix);
    }

    return parts.join('-');
  }

  private formatDate(format: string, date: Date): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    const replacements: Record<string, string> = {
      YYYYMMDD: `${year}${month}${day}`,
      YYYYMM: `${year}${month}`,
      YYYY: year,
      MMDD: `${month}${day}`,
      MM: month,
      DD: day,
    };

    return replacements[format] ?? `${year}${month}${day}`;
  }

  private async findRuleOrFail(
    id: string,
    actor: ActorContext,
  ): Promise<DocumentNumberRuleEntity> {
    const rule = await this.ruleRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!rule) {
      throw new NotFoundException(`Document numbering rule ${id} not found`);
    }
    return rule;
  }
}
