import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DepositMovementSource, DepositMovementType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DepositService } from '../deposit/deposit.service';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositPeriodGuardService } from '../deposit-period-lock/deposit-period-guard.service';
import { DepositReconService } from '../deposit-recon/deposit-recon.service';
import { JournalService } from '../journal/journal.service';
import { DepositAuditAction, DepositAuditEntityType } from '../deposit-audit/deposit-audit-log.entity';
import { DepositAuditService } from '../deposit-audit/deposit-audit.service';

/** sourceRefLineId marker for the ORIGINAL fee leg (DFR-03) — never reversed (BR-REF-03). */
const FEE_LINE_MARKER = 'FEE';
/** sourceRefLineId marker for a reversal movement produced by unreconciled-cancel replay guard. */
const REVERSAL_SUFFIX = '-REVERSAL';

export interface ReverseForCancelledInvoiceResult {
  reversedCount: number;
  movementIds: string[];
}

/**
 * FR-11 — reversing the deposit side of a cancelled non-cash POS invoice
 * (TKT-DFR-05). Mirrors `JournalReverseConsumer` for the sale-level journal
 * entry; this handles the SEPARATE deposit-fund movement + its own journal
 * entry (deposit_movements has no stored contraAccountId, so the original
 * journal entry's credit line is looked up to reverse it symmetrically).
 */
@Injectable()
export class DepositRefundService {
  private readonly logger = new Logger(DepositRefundService.name);

  constructor(
    @InjectRepository(DepositMovementEntity)
    private readonly movementRepo: Repository<DepositMovementEntity>,
    private readonly dataSource: DataSource,
    private readonly depositService: DepositService,
    private readonly journal: JournalService,
    private readonly recon: DepositReconService,
    private readonly periodGuard: DepositPeriodGuardService,
    private readonly audit: DepositAuditService,
  ) {}

  async reverseForCancelledInvoice(
    invoiceId: string,
    actor: ActorContext,
  ): Promise<ReverseForCancelledInvoiceResult> {
    const grossRows = await this.movementRepo
      .createQueryBuilder('m')
      .where('m.organizationId = :org', { org: actor.organizationId })
      .andWhere('m.source = :src', { src: DepositMovementSource.POS_INVOICE })
      .andWhere('m.sourceRefId = :id', { id: invoiceId })
      .andWhere(
        '(m.sourceRefLineId IS NULL OR (m.sourceRefLineId != :fee AND m.sourceRefLineId NOT LIKE :rev))',
        { fee: FEE_LINE_MARKER, rev: `%${REVERSAL_SUFFIX}` },
      )
      .getMany();

    if (grossRows.length === 0) {
      this.logger.log(`No deposit movement for invoice ${invoiceId} — nothing to reverse`);
      return { reversedCount: 0, movementIds: [] };
    }

    const movementIds: string[] = [];
    for (const gross of grossRows) {
      const id = await this.reverseOne(gross, actor);
      if (id) movementIds.push(id);
    }
    return { reversedCount: movementIds.length, movementIds };
  }

  private async reverseOne(
    gross: DepositMovementEntity,
    actor: ActorContext,
  ): Promise<string | null> {
    const reversalKey = `${gross.sourceRefLineId}${REVERSAL_SUFFIX}`;
    const sourceRefId = gross.sourceRefId as string;

    return this.dataSource.transaction(async (manager) => {
      // Idempotent replay: a reversal for this line already exists.
      const existing = await manager.getRepository(DepositMovementEntity).findOne({
        where: {
          source: DepositMovementSource.POS_INVOICE,
          sourceRefId,
          sourceRefLineId: reversalKey,
        },
      });
      if (existing) {
        this.logger.log(`Reversal already recorded for movement ${gross.id} — no-op`);
        return existing.id;
      }

      // BR-REF-02: a reconciled/discrepancy movement is locked — the caller
      // must issue a separate customer-refund payment instead.
      try {
        await this.recon.assertNotReconciled(gross.id, manager);
      } catch {
        throw new ConflictException(
          `Deposit movement ${gross.id} has already been reconciled — create a separate customer-refund payment instead (BR-REF-02)`,
        );
      }
      // BR-LOCK-01
      await this.periodGuard.assertNotLocked(gross.branchId, gross.docDate, manager);

      // The original contra account isn't stored on deposit_movements — read
      // it off the original (already-committed) journal entry's credit line
      // (BR-REF-01: DEPOSIT posted DR deposit-COA / CR contra).
      const contraAccountId = gross.journalEntryId
        ? await this.resolveOriginalContra(gross.journalEntryId, actor)
        : undefined;
      if (!contraAccountId) {
        throw new ConflictException(
          `Cannot reverse deposit movement ${gross.id}: original journal entry or contra account not found`,
        );
      }

      // BR-REF-01: reverse the gross amount only — the original row is kept
      // (no delete), and the fee movement (source_ref_line_id='FEE') is left
      // untouched (BR-REF-03, phí giữ nguyên).
      const { movement } = await this.depositService.recordMovement(
        {
          depositAccountId: gross.depositAccountId,
          type: DepositMovementType.WITHDRAWAL,
          amount: Number(gross.amount),
          contraAccountId,
          source: DepositMovementSource.POS_INVOICE,
          sourceRefId,
          sourceRefLineId: reversalKey,
          docDate: this.today(),
        },
        actor,
        manager,
      );

      await this.audit.record(
        {
          entityType: DepositAuditEntityType.DEPOSIT_MOVEMENT,
          entityId: gross.id,
          action: DepositAuditAction.REVERSE,
          before: gross,
          after: movement,
        },
        actor,
        manager,
      );

      this.logger.log(
        `Reversed deposit movement ${gross.id} (invoice ${gross.sourceRefId}) → ${movement.id}`,
      );
      return movement.id;
    });
  }

  private async resolveOriginalContra(
    journalEntryId: string,
    actor: ActorContext,
  ): Promise<string | undefined> {
    const entry = await this.journal.getById(journalEntryId, actor);
    // The gross DEPOSIT entry posted DR deposit-COA / CR contra — the credit
    // line is the contra account.
    const creditLine = entry.lines.find((l) => Number(l.creditAmount) > 0);
    return creditLine?.accountId;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
