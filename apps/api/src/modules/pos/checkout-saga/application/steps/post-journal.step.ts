import { Injectable } from '@nestjs/common';
import { DocumentType, JournalSource, JournalStatus } from '@erp/shared-interfaces';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { JournalEntryEntity } from '../../../../accounting/journal/journal-entry.entity';
import { JournalLineEntity } from '../../../../accounting/journal/journal-line.entity';
import { mintDocumentNumber } from './mint-document-number';

/**
 * Posts the sale's journal entry inline, in the checkout transaction.
 * Parity target: `journal-sale.consumer.ts` — same line structure (one debit
 * per payment line, a debit to RECEIVABLE when `remainder > 0`, one credit to
 * REVENUE for the full `amountDue`).
 *
 * Deliberately does NOT call `JournalService.post()`. That method, even given
 * a `manager`, still (a) calls `DocumentNumberingService.generate()`
 * unconditionally — a non-participating `SERIALIZABLE` transaction, exactly
 * the bug ADR-02 already closed for invoice numbers, reintroduced here for
 * journal numbers — and (b) publishes `JOURNAL_POSTED` directly to Kafka
 * right after its own write, with no awareness that the caller's outer
 * transaction hasn't committed yet (bug (b)/(c) in 00-intent.md,
 * reintroduced). Both are pre-existing `JournalService` behaviour and
 * off-limits to change. This step writes the two tables directly instead, and
 * mints the number via `mintDocumentNumber` (T-03-02, generalized from
 * T-02-03's ADR-02 fix so it isn't duplicated a second time).
 *
 * Does not publish `JOURNAL_POST_SALE` (ADR-03) or `JOURNAL_POSTED` —
 * nothing downstream of this slice consumes either from the v2 flow yet.
 *
 * No `validateAccounts`/active-account re-check: every accountId here came
 * from `resolve-accounts` (preflight), which only ever returns an active
 * account. The balance check stays as a defensive assertion — cheap, and it
 * turns a real construction bug into a loud, immediate failure (rolling back
 * the whole checkout) instead of a silently unbalanced journal entry.
 */
@Injectable()
export class PostJournalStep implements CheckoutStep {
  readonly name = 'post-journal';
  readonly phase = 'transactional' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const accounts = ctx.accounts;
    const totals = ctx.totals;
    if (!invoice || !accounts || !totals) {
      throw new Error(
        'post-journal ran before its prerequisite steps populated the context',
      );
    }

    const lines: Array<{ accountId: string; debitAmount: number; creditAmount: number }> = [];

    ctx.input.payments.forEach((payment, idx) => {
      lines.push({
        accountId: accounts.perPayment[idx].accountId,
        debitAmount: Number(payment.amount),
        creditAmount: 0,
      });
    });

    if (totals.remainder > 0) {
      if (!accounts.receivableAccountId) {
        // compute-totals (preflight) already enforces this when remainder > 0
        // — reaching here would mean that guard regressed, not a user error.
        throw new Error(
          'post-journal: remainder > 0 but no receivableAccountId was resolved',
        );
      }
      lines.push({
        accountId: accounts.receivableAccountId,
        debitAmount: Number(totals.remainder),
        creditAmount: 0,
      });
    }

    lines.push({
      accountId: accounts.revenueAccountId,
      debitAmount: 0,
      creditAmount: Number(totals.amountDue),
    });

    const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
    if (Math.abs(totalDebits - totalCredits) > 0.001) {
      throw new Error(
        `post-journal: unbalanced entry (debits=${totalDebits}, credits=${totalCredits}) for invoice ${invoice.id}`,
      );
    }

    const documentNumber = await mintDocumentNumber(
      manager,
      DocumentType.JOURNAL,
      invoice.branchId,
      ctx.actor,
    );

    const now = new Date();
    const entryRepo = manager.getRepository(JournalEntryEntity);
    const savedEntry = await entryRepo.save(
      entryRepo.create({
        organizationId: ctx.actor.organizationId,
        branchId: ctx.actor.branchId,
        createdBy: ctx.actor.userId,
        documentNumber,
        source: JournalSource.SALE,
        sourceReferenceId: invoice.id,
        description: `POS Invoice ${ctx.documentNumber}`,
        status: JournalStatus.POSTED,
        postedAt: now,
        postedBy: ctx.actor.userId,
      }),
    );

    const lineRepo = manager.getRepository(JournalLineEntity);
    await lineRepo.save(
      lines.map((line, idx) =>
        lineRepo.create({
          journalEntryId: savedEntry.id,
          organizationId: ctx.actor.organizationId,
          branchId: ctx.actor.branchId,
          createdBy: ctx.actor.userId,
          accountId: line.accountId,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          lineOrder: idx + 1,
        }),
      ),
    );

    // post-cash links its Phiếu thu to this entry rather than posting a second one.
    ctx.journalEntryId = savedEntry.id;
  }
}
