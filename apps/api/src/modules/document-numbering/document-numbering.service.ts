import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, IsNull, Repository } from "typeorm";
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
 * the date-based monthly layout (e.g. JNL-202605-00001). Prefixes match the
 * organization's standard document-code table.
 *
 * Every field past `continuous` is optional and defaults to exactly what the two
 * rule creators used to hardcode, so a type that does not name one keeps the
 * shape it has always had. INVOICE and RETURN are the only types that override
 * them today: a customer reads the number off a printed receipt, so it carries
 * the date and a per-day sequence instead of a prefix and a monthly one.
 */
export const DEFAULT_DOC_NUMBER_CONFIG: Record<
  DocumentType,
  {
    prefix: string;
    continuous: boolean;
    dateFormat?: string;
    sequenceLength?: number;
    resetPolicy?: ResetPolicy;
    separator?: string;
    suffix?: string;
  }
> = {
  // Receipt-facing types — YYMMDD + a 4-digit sequence that restarts every day, no
  // separator. RETURN shares the shape and is told apart by the TH suffix, so a
  // sale and a return issued the same day never collide on invoices.code.
  [DocumentType.INVOICE]: {
    prefix: "",
    continuous: false,
    dateFormat: "YYMMDD",
    sequenceLength: 4,
    resetPolicy: ResetPolicy.DAILY,
    separator: "",
  },
  [DocumentType.RETURN]: {
    prefix: "",
    continuous: false,
    dateFormat: "YYMMDD",
    sequenceLength: 4,
    resetPolicy: ResetPolicy.DAILY,
    separator: "",
    suffix: "TH",
  },
  // Legacy accounting / POS types — date-based, monthly reset, 5-digit
  [DocumentType.SALE]: { prefix: "SAL", continuous: false },
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
  [DocumentType.CUSTOMER_GROUP]: { prefix: "NKH", continuous: true },
  [DocumentType.PROMOTION]: { prefix: "KM", continuous: true },
};

/**
 * Document types whose records are unique per organization rather than per
 * branch — customers, suppliers, employees and the other master-data codes.
 *
 * A branch-scoped rule for one of these gives each branch its own counter while
 * the table behind it still enforces uniqueness across the whole organization
 * (`uq_customer_org_code` and friends), so two branches issue the same code and
 * whichever writes second is rejected. Branch overrides stay legal for real
 * documents, where per-branch prefixes are a deliberate feature.
 */
export const ORGANIZATION_SCOPED_DOC_TYPES: ReadonlySet<DocumentType> = new Set([
  DocumentType.CUSTOMER,
  DocumentType.CUSTOMER_GROUP,
  DocumentType.SUPPLIER,
  DocumentType.EMPLOYEE,
  DocumentType.DELIVERY_PARTNER,
  DocumentType.PROMOTION,
]);

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
    if (dto.branchId && ORGANIZATION_SCOPED_DOC_TYPES.has(dto.documentType)) {
      throw new BadRequestException(
        `${dto.documentType} records are unique per organization, so their numbering ` +
          `cannot be scoped to a branch. Omit branchId to configure the organization-wide rule.`,
      );
    }

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

  /**
   * `manager` must be passed whenever the caller already holds a transaction.
   * Without it this opens its own, which means a second connection is checked
   * out of the pool while the caller still holds the first — enough concurrent
   * callers and every connection is held by a transaction waiting for one that
   * will never come free, and the pool deadlocks.
   */
  async generate(
    documentType: DocumentType,
    branchId: string | undefined,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<string> {
    await this.ensureBranchRule(documentType, branchId, actor, manager);

    let rule = await this.resolveActiveRule(
      documentType,
      branchId,
      actor.organizationId,
      manager,
    );

    if (!rule) {
      rule = await this.ensureDefaultActiveRule(documentType, actor, manager);
    }

    if (!rule) {
      throw new NotFoundException(
        `No active document numbering rule found for ${documentType}. Please configure one before proceeding.`,
      );
    }

    const now = new Date();
    const resetKey = this.computeResetKey(rule.resetPolicy, now);
    const nextValue = await this.atomicIncrement(rule, resetKey, actor, manager);

    return this.formatDocumentNumber(rule, now, nextValue);
  }

  async preview(
    documentType: DocumentType,
    branchId: string | undefined,
    actor: ActorContext,
  ): Promise<string> {
    await this.ensureBranchRule(documentType, branchId, actor);

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

  /**
   * Raise the counter so the next generated number is at least `minValue + 1`.
   * No-op when the counter is already ahead — a counter is never lowered.
   *
   * The counter is not always the only writer of the column it numbers: SQL
   * seeds and spreadsheet imports insert codes of the same shape without going
   * through `generate`, which then keeps re-issuing numbers an existing row
   * already holds until the insert dies on that table's unique index. Callers
   * that hit such a collision re-sync the counter here instead of skipping past
   * the drift one number at a time.
   */
  async ensureSequenceAtLeast(
    documentType: DocumentType,
    branchId: string | undefined,
    actor: ActorContext,
    minValue: number,
    callerManager?: EntityManager,
  ): Promise<void> {
    const rule = await this.resolveActiveRule(
      documentType,
      branchId,
      actor.organizationId,
      callerManager,
    );
    if (!rule) return;

    const resetKey = this.computeResetKey(rule.resetPolicy, new Date());

    const fastForward = async (manager: EntityManager): Promise<void> => {
      const counterRepo = manager.getRepository(DocumentNumberCounterEntity);
      const counter = await counterRepo.findOne({
        where: { ruleId: rule.id, resetKey },
        lock: { mode: "pessimistic_write" },
      });
      // No counter row means nothing has been issued for this period yet, so
      // the caller's next `generate` creates it — there is no drift to correct.
      if (!counter || Number(counter.currentValue) >= minValue) return;

      counter.currentValue = minValue;
      await counterRepo.save(counter);
      this.logger.warn(
        `Fast-forwarded ${documentType} counter to ${minValue} in organization ${actor.organizationId} — ` +
          `existing records held numbers the counter never issued`,
      );
    };

    // See `generate` — a caller that already holds a transaction must lend it,
    // or this checks out a second connection while holding the first.
    if (callerManager) {
      await fastForward(callerManager);
      return;
    }
    await this.dataSource.transaction(fastForward);
  }

  /**
   * INVOICE/RETURN counters are branch-scoped (ADR-07 in
   * `03-logical-design.md`): `resolveActiveRule` already prefers a branch rule
   * over the org-wide one, but nobody ever creates that branch rule. Called
   * from `generate()`/`preview()` only — the saga's `NextDocumentNumberStep`/
   * `mintDocumentNumber` must stay unaware of this service (see the comment
   * there) and only lock/increment a rule this preflight step already made
   * exist.
   *
   * No-op for every document type other than INVOICE/RETURN, for calls
   * without a `branchId`, and for a branch that already has an active rule —
   * the cheap existence check below runs outside any transaction so a branch
   * with its rule already in place never pays for one.
   */
  private async ensureBranchRule(
    documentType: DocumentType,
    branchId: string | undefined,
    actor: ActorContext,
    callerManager?: EntityManager,
  ): Promise<void> {
    if (!branchId) return;
    if (documentType !== DocumentType.INVOICE && documentType !== DocumentType.RETURN) {
      return;
    }

    const readRepo = callerManager
      ? callerManager.getRepository(DocumentNumberRuleEntity)
      : this.ruleRepo;
    const existingBranchRule = await readRepo.findOne({
      where: {
        organizationId: actor.organizationId,
        branchId,
        documentType,
        isActive: true,
      },
    });
    if (existingBranchRule) return;

    const cloneIntoBranch = async (manager: EntityManager): Promise<void> => {
      const ruleRepo = manager.getRepository(DocumentNumberRuleEntity);

      // Re-check inside the transaction: a concurrent first request for this
      // branch today may already have committed the rule between the read
      // above and this transaction starting.
      const stillMissing = !(await ruleRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          branchId,
          documentType,
          isActive: true,
        },
      }));
      if (!stillMissing) return;

      let orgRule = await ruleRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          branchId: IsNull(),
          documentType,
          isActive: true,
        },
      });
      if (!orgRule) {
        orgRule = await this.ensureDefaultActiveRule(documentType, actor, manager);
      }
      if (!orgRule) return;

      const branchRule = ruleRepo.create({
        organizationId: orgRule.organizationId,
        branchId,
        documentType: orgRule.documentType,
        prefix: orgRule.prefix,
        suffix: orgRule.suffix,
        includeDate: orgRule.includeDate,
        dateFormat: orgRule.dateFormat,
        sequenceLength: orgRule.sequenceLength,
        separator: orgRule.separator,
        resetPolicy: orgRule.resetPolicy,
        isActive: true,
        createdBy: actor.userId,
      });

      try {
        await ruleRepo.save(branchRule);
      } catch (error) {
        // Lost the race to a concurrent first request for this branch today —
        // the unique index on (branchId, documentType, isActive) rejected
        // this insert, same pattern as `ensureDefaultActiveRule`. Inside the
        // caller's own transaction the failed statement has already aborted
        // it, so there is nothing left to read back here; propagate and let
        // the caller retry.
        if (callerManager) throw error;
        this.logger.warn(
          `Lost race creating branch numbering rule for ${documentType} in branch ${branchId}, reusing the winner's rule`,
        );
        return;
      }

      // Fast-forward the new branch counter to at least where the org-wide
      // counter stands today, so a mid-day cutover cannot reissue a number
      // this same branch already holds under the shared counter.
      const resetKey = this.computeResetKey(orgRule.resetPolicy, new Date());
      const counterRepo = manager.getRepository(DocumentNumberCounterEntity);
      const orgCounter = await counterRepo.findOne({
        where: { ruleId: orgRule.id, resetKey },
      });
      const currentValue = Number(orgCounter?.currentValue ?? 0);

      // `ensureSequenceAtLeast` intentionally no-ops when there is no counter
      // row yet for (ruleId, resetKey) — for its other caller
      // (`customer-code.service.ts`) that row always already exists. This
      // branch rule is brand new, so seed today's counter at 0 first; then
      // `ensureSequenceAtLeast` has an existing row to raise to `currentValue`
      // (or leaves it at 0 if the org-wide counter hasn't issued anything
      // today either).
      await counterRepo.save(
        counterRepo.create({
          ruleId: branchRule.id,
          organizationId: actor.organizationId,
          branchId,
          resetKey,
          currentValue: 0,
        }),
      );

      if (currentValue > 0) {
        await this.ensureSequenceAtLeast(
          documentType,
          branchId,
          actor,
          currentValue,
          manager,
        );
      }
    };

    if (callerManager) {
      await cloneIntoBranch(callerManager);
      return;
    }
    await this.dataSource.transaction(cloneIntoBranch);
  }

  private async resolveActiveRule(
    documentType: DocumentType,
    branchId: string | undefined,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<DocumentNumberRuleEntity | null> {
    const ruleRepo = manager
      ? manager.getRepository(DocumentNumberRuleEntity)
      : this.ruleRepo;

    if (branchId && !ORGANIZATION_SCOPED_DOC_TYPES.has(documentType)) {
      const branchRule = await ruleRepo.findOne({
        where: {
          organizationId,
          branchId,
          documentType,
          isActive: true,
        },
      });
      if (branchRule) return branchRule;
    }

    return ruleRepo.findOne({
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
    manager?: EntityManager,
  ): Promise<DocumentNumberRuleEntity | null> {
    const ruleRepo = manager
      ? manager.getRepository(DocumentNumberRuleEntity)
      : this.ruleRepo;
    // continuous numbering (e.g. "NK000001", "NK000002", ...) — no date segment, never reset
    const config = DEFAULT_DOC_NUMBER_CONFIG[documentType];
    const useContinuous = config.continuous;
    const defaultRule = ruleRepo.create({
      organizationId: actor.organizationId,
      branchId: undefined,
      documentType,
      prefix: this.getDefaultPrefix(documentType),
      suffix: config.suffix,
      includeDate: !useContinuous,
      dateFormat: config.dateFormat ?? "YYYYMM",
      sequenceLength: config.sequenceLength ?? (useContinuous ? 6 : 5),
      separator: config.separator ?? "-",
      resetPolicy:
        config.resetPolicy ??
        (useContinuous ? ResetPolicy.NEVER : ResetPolicy.MONTHLY),
      isActive: true,
      createdBy: actor.userId,
    });

    try {
      const savedRule = await ruleRepo.save(defaultRule);
      this.logger.warn(
        `Auto-created default numbering rule for ${documentType} in organization ${actor.organizationId}`,
      );
      return savedRule;
    } catch (error) {
      // A concurrent caller won the race and `UQ_doc_rule_org_default` rejected
      // this insert, so the winner's rule is committed and visible — re-read it.
      // Only safe on our own connection: inside the caller's transaction the
      // failed statement has already aborted it, so nothing can be read back
      // and the caller has to roll back and retry instead.
      if (manager) throw error;

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
   *
   * Two callers racing for the same (ruleId, resetKey) can make Postgres pick
   * one as the SSI victim under SERIALIZABLE, which surfaces as a 40001
   * "could not serialize access due to concurrent update" error even though
   * the pessimistic_write lock alone would have serialized them correctly.
   * Postgres' own guidance for 40001 is to retry the transaction, so a losing
   * attempt just retries — the caller sees a slightly slower success, not a 500.
   */
  private async atomicIncrement(
    rule: DocumentNumberRuleEntity,
    resetKey: string,
    actor: ActorContext,
    callerManager?: EntityManager,
  ): Promise<number> {
    // In the caller's transaction there is nothing to retry into: a failed
    // statement aborts the whole transaction, so the caller rolls back and
    // retries. `pessimistic_write` alone serializes concurrent callers
    // correctly once the counter row exists, which is every call but the first
    // of a reset period.
    if (callerManager) {
      return this.lockAndIncrement(callerManager, rule, resetKey, actor);
    }

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.dataSource.transaction("SERIALIZABLE", (manager) =>
          this.lockAndIncrement(manager, rule, resetKey, actor),
        );
      } catch (err) {
        if (this.isSerializationFailure(err) && attempt < maxAttempts) {
          continue;
        }
        throw err;
      }
    }
    /* istanbul ignore next -- unreachable: the loop always returns or throws */
    throw new Error("atomicIncrement: exhausted retry attempts");
  }

  /** Locks the counter row for (rule, resetKey) and returns the next value. */
  private async lockAndIncrement(
    manager: EntityManager,
    rule: DocumentNumberRuleEntity,
    resetKey: string,
    actor: ActorContext,
  ): Promise<number> {
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
  }

  /** Postgres 40001 (serialization_failure) — safe and expected to retry. */
  private isSerializationFailure(err: unknown): boolean {
    const e = err as { code?: string; driverError?: { code?: string } };
    return e?.code === "40001" || e?.driverError?.code === "40001";
  }

  private formatDocumentNumber(
    rule: DocumentNumberRuleEntity,
    now: Date,
    sequence: number,
  ): string {
    const seq = sequence.toString().padStart(rule.sequenceLength, "0");
    // Continuous rules (no date, no suffix) render as "<prefix><seq>" so users
    // see "NK000001" instead of "NK-000001". Rules with a date or suffix join
    // their segments with the rule's own separator — "-" for the legacy layout,
    // "" for run-together numbers like 2608210001.
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
    return parts.join(rule.separator);
  }

  private formatDate(format: string, date: Date): string {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");

    const replacements: Record<string, string> = {
      YYMMDD: `${year.slice(-2)}${month}${day}`,
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
