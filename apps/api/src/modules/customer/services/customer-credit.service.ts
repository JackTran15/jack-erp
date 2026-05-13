import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CustomerCreditStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CustomerCreditEntity } from '../customer-credit.entity';
import { InvoiceEntity } from '../../pos/entities/invoice.entity';

@Injectable()
export class CustomerCreditService {
  private readonly logger = new Logger(CustomerCreditService.name);

  constructor(
    @InjectRepository(CustomerCreditEntity)
    private readonly repo: Repository<CustomerCreditEntity>,
  ) {}

  /**
   * Issue a new store credit when a RETURN settles with refundMethod = STORE_CREDIT.
   * Reference code is derived from the issuing invoice code with `-CR` suffix
   * (e.g. `RT-2026-0001-CR`); unique per org via DB constraint `uq_customer_credit_ref`.
   */
  async issue(
    invoice: InvoiceEntity,
    amount: string | number,
    manager?: EntityManager,
  ): Promise<CustomerCreditEntity> {
    if (!invoice.customerId) {
      throw new BadRequestException('STORE_CREDIT yêu cầu customerId trên invoice');
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new BadRequestException(`Số tiền credit không hợp lệ: ${amount}`);
    }

    const repo = manager
      ? manager.getRepository(CustomerCreditEntity)
      : this.repo;

    const referenceCode = `${invoice.code}-CR`;

    const credit = repo.create({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      customerId: invoice.customerId,
      sourceInvoiceId: invoice.id,
      referenceCode,
      originalAmount: amt,
      remainingAmount: amt,
      usedAmount: 0,
      status: CustomerCreditStatus.OPEN,
      issuedAt: new Date().toISOString().slice(0, 10),
      createdBy: invoice.createdBy,
    });

    const saved = await repo.save(credit);
    this.logger.log(
      `Issued customer credit ${referenceCode} amount=${amt} for invoice ${invoice.code}`,
    );
    return saved;
  }

  /**
   * Redeem an OPEN credit against another invoice. Decrements remaining,
   * increments used, flips to CONSUMED when fully drawn.
   */
  async redeem(
    creditId: string,
    amount: string | number,
    invoiceId: string,
    actor: ActorContext,
    manager: EntityManager,
  ): Promise<CustomerCreditEntity> {
    const repo = manager.getRepository(CustomerCreditEntity);
    const credit = await repo.findOne({
      where: { id: creditId, organizationId: actor.organizationId },
    });
    if (!credit) {
      throw new NotFoundException(`Credit ${creditId} not found`);
    }
    if (credit.status !== CustomerCreditStatus.OPEN) {
      throw new BadRequestException(
        `Credit ${credit.referenceCode} đã ${credit.status}, không thể dùng`,
      );
    }
    const amt = Number(amount);
    const remaining = Number(credit.remainingAmount);
    if (amt <= 0) {
      throw new BadRequestException(`Số tiền redeem không hợp lệ: ${amount}`);
    }
    if (remaining < amt) {
      throw new BadRequestException(
        `Credit ${credit.referenceCode} không đủ số dư (remaining=${remaining}, requested=${amt})`,
      );
    }

    credit.remainingAmount = Number((remaining - amt).toFixed(2));
    credit.usedAmount = Number((Number(credit.usedAmount) + amt).toFixed(2));
    if (credit.remainingAmount === 0) {
      credit.status = CustomerCreditStatus.CONSUMED;
    }

    const saved = await repo.save(credit);
    this.logger.log(
      `Redeemed ${amt} from credit ${credit.referenceCode} (remaining=${credit.remainingAmount}, invoice=${invoiceId}, actor=${actor.userId})`,
    );
    return saved;
  }

  async listOpenForCustomer(
    customerId: string,
    actor: ActorContext,
  ): Promise<CustomerCreditEntity[]> {
    return this.repo.find({
      where: {
        customerId,
        organizationId: actor.organizationId,
        status: CustomerCreditStatus.OPEN,
      },
      order: { issuedAt: 'ASC' },
    });
  }
}
