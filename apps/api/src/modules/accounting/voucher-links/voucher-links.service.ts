import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, EntityTarget, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CashReceiptEntity } from '../cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashPaymentEntity } from '../cash-vouchers/cash-payments/cash-payment.entity';
import { BankReceiptEntity } from '../deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankPaymentEntity } from '../deposit-vouchers/bank-payments/bank-payment.entity';
import { VoucherLinkEntity } from './voucher-link.entity';
import { VoucherLinkKind, VoucherLinkRelation } from './enums';

/** Which table each link endpoint kind lives in. */
const ENTITY_BY_KIND: Record<
  VoucherLinkKind,
  EntityTarget<{ id: string; documentNumber?: string }>
> = {
  [VoucherLinkKind.CASH_RECEIPT]: CashReceiptEntity,
  [VoucherLinkKind.CASH_PAYMENT]: CashPaymentEntity,
  [VoucherLinkKind.BANK_RECEIPT]: BankReceiptEntity,
  [VoucherLinkKind.BANK_PAYMENT]: BankPaymentEntity,
};

/** The counterpart voucher, as returned on a voucher detail response. */
export interface LinkedVoucher {
  kind: VoucherLinkKind;
  id: string;
  documentNumber: string | null;
  relation: VoucherLinkRelation;
}

export interface CreateVoucherLinkArgs {
  fromKind: VoucherLinkKind;
  fromId: string;
  toKind: VoucherLinkKind;
  toId: string;
  relation: VoucherLinkRelation;
  invoiceId?: string;
  actor: ActorContext;
}

/**
 * Writes and reads the links between vouchers that live in different tables.
 *
 * More than one consumer pairs vouchers, so the write lives here rather than
 * inside any one of them.
 */
@Injectable()
export class VoucherLinksService {
  private readonly logger = new Logger(VoucherLinksService.name);

  constructor(
    @InjectRepository(VoucherLinkEntity)
    private readonly repo: Repository<VoucherLinkEntity>,
  ) {}

  /**
   * Record a link, ignoring a pair that is already there.
   *
   * `manager` is required, not optional: the link has to commit with the
   * voucher that caused it, otherwise a rolled-back voucher leaves a link
   * pointing at a row that never existed.
   */
  async link(
    args: CreateVoucherLinkArgs,
    manager: EntityManager,
  ): Promise<VoucherLinkEntity> {
    const { actor, ...link } = args;

    await manager
      .createQueryBuilder()
      .insert()
      .into(VoucherLinkEntity)
      .values({
        ...link,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
      })
      .orIgnore()
      .execute();

    // Re-read rather than trusting the insert result: on a replay the insert is
    // a no-op and returns no row, but the caller still wants the existing link.
    const saved = await manager.findOneOrFail(VoucherLinkEntity, {
      where: {
        organizationId: actor.organizationId,
        fromKind: link.fromKind,
        fromId: link.fromId,
        toKind: link.toKind,
        toId: link.toId,
        relation: link.relation,
      },
    });

    this.logger.log(
      `Linked ${link.fromKind} ${link.fromId} → ${link.toKind} ${link.toId} (${link.relation})`,
    );

    return saved;
  }

  /**
   * The link a voucher takes part in, from either end. Returns the counterpart
   * side so a caller can render "refunded by PC0009" without knowing which
   * direction the link was written in.
   */
  async findFor(
    kind: VoucherLinkKind,
    id: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<{
    link: VoucherLinkEntity;
    counterpartKind: VoucherLinkKind;
    counterpartId: string;
  } | null> {
    const repo = manager ? manager.getRepository(VoucherLinkEntity) : this.repo;

    const asFrom = await repo.findOne({
      where: { organizationId, fromKind: kind, fromId: id },
    });
    if (asFrom) {
      return {
        link: asFrom,
        counterpartKind: asFrom.toKind,
        counterpartId: asFrom.toId,
      };
    }

    const asTo = await repo.findOne({
      where: { organizationId, toKind: kind, toId: id },
    });
    if (asTo) {
      return {
        link: asTo,
        counterpartKind: asTo.fromKind,
        counterpartId: asTo.fromId,
      };
    }

    return null;
  }

  /**
   * The counterpart voucher of `(kind, id)`, ready to serve on a detail
   * response — resolves its document number from whichever table it lives in.
   * `null` when the voucher takes part in no link.
   */
  async findLinkedVoucher(
    kind: VoucherLinkKind,
    id: string,
    organizationId: string,
  ): Promise<LinkedVoucher | null> {
    const found = await this.findFor(kind, id, organizationId);
    if (!found) return null;

    const counterpart = await this.repo.manager.findOne(
      ENTITY_BY_KIND[found.counterpartKind],
      { where: { id: found.counterpartId } },
    );

    return {
      kind: found.counterpartKind,
      id: found.counterpartId,
      documentNumber: counterpart?.documentNumber ?? null,
      relation: found.link.relation,
    };
  }
}
