import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckoutContext, CheckoutStep } from '../checkout-step';
import { InvoiceEntity, InvoiceStatus } from '../../../entities/invoice.entity';
import { InvoiceItemEntity } from '../../../entities/invoice-item.entity';
import { CheckoutSagaEntity, CheckoutSagaStatus } from '../../infrastructure/checkout-saga.entity';

/**
 * Loads the draft and its lines, and rejects anything that cannot be checked
 * out at all — before any account, fund or promotion lookup runs, so a
 * malformed draft never causes work that has to be undone.
 *
 * Parity target: checkout-invoice.service.ts:109-139.
 *
 * Amendment (T-02-09, A-13): the isDraft guard on its own made a genuine
 * idempotent replay unreachable — after a successful checkout the invoice is
 * no longer a draft, so a client resubmitting the same request (same
 * `x-idempotency-key`, e.g. after a lost response) would hit
 * `INVOICE_NOT_CHECKOUTABLE` here before ever reaching `open-saga`'s replay
 * check (a transactional step, phase-ordered after every preflight step).
 * This is now a two-tier check: a light, non-locking read here to let a
 * confirmed-completed replay past the guard; `open-saga` remains the
 * authoritative, locked source of truth for what actually gets replayed —
 * this step never itself sets `ctx.replayed` or trusts its own read for
 * anything beyond "don't reject this outright".
 */
@Injectable()
export class LoadDraftStep implements CheckoutStep {
  readonly name = 'load-draft';
  readonly phase = 'preflight' as const;

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    @InjectRepository(CheckoutSagaEntity)
    private readonly sagaRepo: Repository<CheckoutSagaEntity>,
  ) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({
      where: {
        id: ctx.input.invoiceId,
        organizationId: ctx.actor.organizationId,
      },
    });

    if (!invoice) {
      throw new BadRequestException({
        code: 'INVOICE_NOT_FOUND',
        message: `Invoice ${ctx.input.invoiceId} not found`,
      });
    }

    if (!invoice.isDraft || invoice.status !== InvoiceStatus.DRAFT) {
      if (!(await this.isCompletedReplay(ctx))) {
        throw new BadRequestException({
          code: 'INVOICE_NOT_CHECKOUTABLE',
          message: `Invoice ${ctx.input.invoiceId} is not a draft and cannot be checked out`,
        });
      }
    }

    const items = await this.itemRepo.find({
      where: { invoiceId: invoice.id },
      order: { sortOrder: 'ASC' },
    });

    if (items.length === 0) {
      throw new BadRequestException({
        code: 'INVOICE_NOT_CHECKOUTABLE',
        message: `Invoice ${ctx.input.invoiceId} has no items`,
      });
    }

    const itemsMissingLocation = items.filter((item) => !item.locationId);
    if (itemsMissingLocation.length > 0) {
      throw new BadRequestException({
        code: 'INVOICE_NOT_CHECKOUTABLE',
        message: `Invoice ${ctx.input.invoiceId} has items without an assigned location: ${itemsMissingLocation
          .map((item) => item.itemId)
          .join(', ')}. Configure product → location mapping before checkout.`,
      });
    }

    ctx.invoice = invoice;
    ctx.items = items;
  }

  /**
   * Non-locking check, deliberately weaker than `open-saga`'s: only asks "has
   * this idempotency key already completed?", never sets `ctx.replayed` or
   * anything else on ctx. `open-saga` (transactional, locked) is still what
   * actually decides and populates a replay — this only keeps a resubmitted
   * request from being rejected before it can reach that decision.
   */
  private async isCompletedReplay(ctx: CheckoutContext): Promise<boolean> {
    const saga = await this.sagaRepo.findOne({
      where: {
        organizationId: ctx.actor.organizationId,
        idempotencyKey: ctx.idempotencyKey,
        status: CheckoutSagaStatus.COMPLETED,
      },
    });
    return !!saga;
  }
}
