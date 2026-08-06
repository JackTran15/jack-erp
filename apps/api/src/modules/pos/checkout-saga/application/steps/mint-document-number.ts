import { BadRequestException } from '@nestjs/common';
import { EntityManager, IsNull, QueryFailedError } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../../common/decorators/actor-context.decorator';
import { DocumentNumberRuleEntity } from '../../../../document-numbering/document-number-rule.entity';
import { DocumentNumberCounterEntity } from '../../../../document-numbering/document-number-counter.entity';
import { computeResetKey, formatDocumentNumber } from './document-number-format';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * The composable half of document numbering, shared by every step that mints
 * a number inside the checkout transaction (`next-document-number.step.ts`
 * for INVOICE, T-02-03; `post-journal.step.ts` for JOURNAL, T-03-02).
 * Extracted from `next-document-number.step.ts` rather than duplicated a
 * second time — this is the app's own code (T-02-03), not a private method of
 * `DocumentNumberingService`, so unlike `document-number-format.ts` (A-06)
 * there is no reason to accept drift risk here.
 *
 * ADR-02: `DocumentNumberingService.generate` opens its own `SERIALIZABLE`
 * transaction and does not accept a `manager`, so a number it mints cannot
 * roll back with the rest of checkout. `mintDocumentNumber` resolves the
 * active rule and locks/increments the counter against the caller's own
 * `manager` instead, so a rollback really does give the number back.
 */
export async function mintDocumentNumber(
  manager: EntityManager,
  documentType: DocumentType,
  branchId: string | undefined,
  actor: ActorContext,
): Promise<string> {
  const rule = await resolveActiveRule(manager, documentType, branchId, actor.organizationId);
  if (!rule) {
    throw new BadRequestException({
      code: 'DOC_NUMBER_RULE_MISSING',
      message: `No active document numbering rule found for ${documentType}`,
    });
  }

  const now = new Date();
  const resetKey = computeResetKey(rule.resetPolicy, now);
  const sequence = await lockAndIncrement(manager, rule.id, resetKey, actor);
  return formatDocumentNumber(rule, now, sequence);
}

/** Ported from DocumentNumberingService.resolveActiveRule — branch override wins over org-wide default. */
async function resolveActiveRule(
  manager: EntityManager,
  documentType: DocumentType,
  branchId: string | undefined,
  organizationId: string,
): Promise<DocumentNumberRuleEntity | null> {
  const ruleRepo = manager.getRepository(DocumentNumberRuleEntity);

  if (branchId) {
    const branchRule = await ruleRepo.findOne({
      where: { organizationId, branchId, documentType, isActive: true },
    });
    if (branchRule) return branchRule;
  }

  return ruleRepo.findOne({
    where: { organizationId, branchId: IsNull(), documentType, isActive: true },
  });
}

/**
 * Locks and increments the counter for (ruleId, resetKey). When the row
 * already exists, `pessimistic_write` alone serializes concurrent checkouts
 * correctly — no SERIALIZABLE isolation needed.
 *
 * The one race `pessimistic_write` cannot cover is the *first* document of a
 * brand new reset period (no counter row exists yet to lock): two concurrent
 * transactions can both see "not found" and both attempt to INSERT. The
 * original service handles this with `SERIALIZABLE` + retry — not available
 * here, because retrying would mean retrying inside an already-poisoned
 * Postgres transaction (a failed statement aborts the whole transaction;
 * nothing after it can succeed until ROLLBACK). So the loser's whole
 * transaction fails and rolls back cleanly instead — an exceedingly rare,
 * retryable failure, not data corruption.
 */
async function lockAndIncrement(
  manager: EntityManager,
  ruleId: string,
  resetKey: string,
  actor: ActorContext,
): Promise<number> {
  const counterRepo = manager.getRepository(DocumentNumberCounterEntity);

  const existing = await manager
    .createQueryBuilder(DocumentNumberCounterEntity, 'counter')
    .setLock('pessimistic_write')
    .where('counter.ruleId = :ruleId', { ruleId })
    .andWhere('counter.resetKey = :resetKey', { resetKey })
    .getOne();

  if (existing) {
    existing.currentValue = Number(existing.currentValue) + 1;
    await counterRepo.save(existing);
    return existing.currentValue;
  }

  const counter = counterRepo.create({
    ruleId,
    organizationId: actor.organizationId,
    branchId: actor.branchId,
    resetKey,
    currentValue: 1,
  });

  try {
    await counterRepo.save(counter);
  } catch (err) {
    if (err instanceof QueryFailedError && (err as any).code === POSTGRES_UNIQUE_VIOLATION) {
      throw new BadRequestException({
        code: 'DOC_NUMBER_COUNTER_CONFLICT',
        message: 'Another transaction just started this numbering period; please retry',
      });
    }
    throw err;
  }
  return 1;
}
