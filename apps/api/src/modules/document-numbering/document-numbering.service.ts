import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, IsNull, Repository } from "typeorm";
import {
  DocumentType,
  PaginationQuery,
  PaginatedResponse,
} from "@erp/shared-interfaces";
import { ActorContext } from "../../common/decorators/actor-context.decorator";
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from "./document-number-rule.entity";
import { DocumentNumberCounterEntity } from "./document-number-counter.entity";
import {
  CreateDocumentNumberRuleDto,
  UpdateDocumentNumberRuleDto,
} from "./dto";

/**
 * Default numbering config per document type, used to auto-create a rule when
 * none is configured. `continuous` types render as "<prefix><6-digit-seq>" with
 * no date and never reset (e.g. NV000001); the legacy accounting/POS types keep
 * the date-based monthly layout (e.g. INV-202605-00001). Prefixes match the
 * organization's standard document-code table.
 */
const DEFAULT_DOC_NUMBER_CONFIG: Record<
  DocumentType,
  { prefix: string; continuous: boolean }
> = {
  // Legacy accounting / POS types — date-based, monthly reset, 5-digit
  [DocumentType.INVOICE]: { prefix: "INV", continuous: false },
  [DocumentType.SALE]: { prefix: "SAL", continuous: false },
  [DocumentType.RETURN]: { prefix: "RTN", continuous: false },
  [DocumentType.ADJUSTMENT]: { prefix: "ADJ", continuous: false },
  [DocumentType.JOURNAL]: { prefix: "JNL", continuous: false },
  [DocumentType.PAYABLE]: { prefix: "PAY", continuous: false },
  [DocumentType.RECEIVABLE]: { prefix: "REC", continuous: false },
  // Standard code types — continuous, 6-digit, never reset
  [DocumentType.QUOTATION]: { prefix: "PBH", continuous: true },
  [DocumentType.PURCHASE_ORDER]: { prefix: "PDH", continuous: true },
  [DocumentType.GOODS_RECEIPT]: { prefix: "NK", continuous: true },
  [DocumentType.GOODS_ISSUE]: { prefix: "XK", continuous: true },
  [DocumentType.TRANSFER]: { prefix: "CK", continuous: true },
  [DocumentType.TRANSFER_ORDER]: { prefix: "LDC", continuous: true },
  [DocumentType.STOCK_COUNT]: { prefix: "KK", continuous: true },
  [DocumentType.CASH_RECEIPT]: { prefix: "PT", continuous: true },
  [DocumentType.CASH_PAYMENT]: { prefix: "PC", continuous: true },
  [DocumentType.CASH_COUNT]: { prefix: "KKQ", continuous: true },
  [DocumentType.BANK_RECEIPT]: { prefix: "NTTK", continuous: true },
  [DocumentType.BANK_PAYMENT]: { prefix: "UNC", continuous: true },
  [DocumentType.EXPENSE]: { prefix: "CP", continuous: true },
  [DocumentType.RECONCILIATION]: { prefix: "DS", continuous: true },
  [DocumentType.DEBT_OFFSET]: { prefix: "BTCN", continuous: true },
  [DocumentType.CUSTOMER]: { prefix: "KH", continuous: true },
  [DocumentType.EMPLOYEE]: { prefix: "NV", continuous: true },
  [DocumentType.SUPPLIER]: { prefix: "NCC", continuous: true },
  [DocumentType.DELIVERY_PARTNER]: { prefix: "DTGH", continuous: true },
  [DocumentType.STOCK_TAKE]: { prefix: "KK", continuous: true },
  [DocumentType.WAREHOUSE]: { prefix: "WH", continuous: true },
};

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
        ? { [query.sortBy]: query.sortOrder ?? "asc" }
        : { createdAt: "DESC" },
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
      throw new NotFoundException(
        `No active document numbering rule found for ${documentType}. Please configure one before proceeding.`,
      );
    }

    const now = new Date();
    const resetKey = this.computeResetKey(rule.resetPolicy, now);
    const nextValue = await this.atomicIncrement(rule, resetKey, actor);

    return this.formatDocumentNumber(rule, now, nextValue);
  }

  async preview(
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
      throw new NotFoundException(
        `No active document numbering rule found for ${documentType}. Please configure one before proceeding.`,
      );
    }

    const now = new Date();
    const resetKey = this.computeResetKey(rule.resetPolicy, now);
    const counter = await this.counterRepo.findOne({
      where: { ruleId: rule.id, resetKey },
    });
    const nextValue = Number(counter?.currentValue ?? 0) + 1;

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
    // continuous numbering (e.g. "NK000001", "NK000002", ...) — no date segment, never reset
    const useContinuous = DEFAULT_DOC_NUMBER_CONFIG[documentType].continuous;
    const defaultRule = this.ruleRepo.create({
      organizationId: actor.organizationId,
      branchId: undefined,
      documentType,
      prefix: this.getDefaultPrefix(documentType),
      suffix: undefined,
      includeDate: !useContinuous,
      dateFormat: "YYYYMM",
      sequenceLength: useContinuous ? 6 : 5,
      resetPolicy: useContinuous ? ResetPolicy.NEVER : ResetPolicy.MONTHLY,
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
    return DEFAULT_DOC_NUMBER_CONFIG[documentType].prefix;
  }

  private computeResetKey(policy: ResetPolicy, now: Date): string {
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");

    switch (policy) {
      case ResetPolicy.DAILY:
        return `${year}-${month}-${day}`;
      case ResetPolicy.MONTHLY:
        return `${year}-${month}`;
      case ResetPolicy.YEARLY:
        return year;
      case ResetPolicy.NEVER:
        return "NEVER";
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
    return this.dataSource.transaction("SERIALIZABLE", async (manager) => {
      const counterRepo = manager.getRepository(DocumentNumberCounterEntity);

      let counter = await counterRepo.findOne({
        where: { ruleId: rule.id, resetKey },
        lock: { mode: "pessimistic_write" },
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
    const seq = sequence.toString().padStart(rule.sequenceLength, "0");
    // Continuous rules (no date, no suffix) render as "<prefix><seq>" so users
    // see "NK000001" instead of "NK-000001". Rules with a date or suffix keep
    // the legacy hyphen-separated layout — readability wins when there are
    // multiple segments to scan.
    if (!rule.includeDate && !rule.suffix) {
      return `${rule.prefix}${seq}`;
    }

    const parts: string[] = [rule.prefix];
    if (rule.includeDate) {
      parts.push(this.formatDate(rule.dateFormat, now));
    }
    parts.push(seq);
    if (rule.suffix) {
      parts.push(rule.suffix);
    }
    return parts.join("-");
  }

  private formatDate(format: string, date: Date): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

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
