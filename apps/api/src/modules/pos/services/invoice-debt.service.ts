import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceEntity } from '../entities/invoice.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
  DebtDocumentType,
} from '../entities/invoice-debt.entity';
import { DebtPaymentEntity, DebtPaymentMethod } from '../entities/debt-payment.entity';

export interface CollectPaymentDto {
  amount: number;
  paymentMethod: DebtPaymentMethod;
  staffId: string;
  note?: string;
}

@Injectable()
export class InvoiceDebtService {
  private readonly logger = new Logger(InvoiceDebtService.name);

  constructor(
    @InjectRepository(InvoiceDebtEntity)
    private readonly debtRepo: Repository<InvoiceDebtEntity>,
    @InjectRepository(DebtPaymentEntity)
    private readonly paymentRepo: Repository<DebtPaymentEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createFromInvoice(
    invoice: InvoiceEntity,
    debtAmount?: number,
    manager?: EntityManager,
  ): Promise<InvoiceDebtEntity> {
    if (!invoice.customerId) {
      throw new BadRequestException(
        'Cannot create debt record: invoice has no associated customer',
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const amount = debtAmount ?? invoice.amountDue;

    const debtData: Partial<InvoiceDebtEntity> = {
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      createdBy: invoice.createdBy,
      referenceCode: invoice.code,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      documentType: DebtDocumentType.CREDIT_INVOICE,
      originalAmount: amount,
      remainingAmount: amount,
      paidAmount: 0,
      issuedAt: today,
      status: DebtStatus.OPEN,
    };

    if (manager) {
      const debtEntity = manager.create(InvoiceDebtEntity, debtData);
      const saved = await manager.save(debtEntity);
      this.logger.log(
        `Created debt record ${saved.id} for invoice ${invoice.id} (customer=${invoice.customerId})`,
      );
      return saved;
    }

    const debtEntity = this.debtRepo.create(debtData);
    const saved = await this.debtRepo.save(debtEntity);
    this.logger.log(
      `Created debt record ${saved.id} for invoice ${invoice.id} (customer=${invoice.customerId})`,
    );
    return saved;
  }

  async findCustomerDebts(
    customerId: string,
    status: DebtStatus | undefined,
    actor: ActorContext,
  ): Promise<InvoiceDebtEntity[]> {
    const where: any = {
      customerId,
      organizationId: actor.organizationId,
    };

    if (status !== undefined) {
      where.status = status;
    }

    return this.debtRepo.find({
      where,
      order: { issuedAt: 'DESC' },
    });
  }

  async collectPayment(
    debtId: string,
    dto: CollectPaymentDto,
    actor: ActorContext,
  ): Promise<InvoiceDebtEntity> {
    return this.dataSource.transaction(async (manager) => {
      const debt = await manager.findOne(InvoiceDebtEntity, {
        where: { id: debtId, organizationId: actor.organizationId },
      });

      if (!debt) {
        throw new NotFoundException(`Debt record ${debtId} not found`);
      }

      if (debt.status === DebtStatus.PAID) {
        throw new BadRequestException(`Debt ${debtId} is already fully paid`);
      }

      if (dto.amount > debt.remainingAmount) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds remaining balance (${debt.remainingAmount})`,
        );
      }

      const now = new Date();

      const paymentEntity = manager.create(DebtPaymentEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        debtId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        staffId: dto.staffId,
        paidAt: now,
        note: dto.note,
      });
      await manager.save(paymentEntity);

      const round = (v: number) => Math.round(v * 100) / 100;
      debt.paidAmount = round(Number(debt.paidAmount) + dto.amount);
      debt.remainingAmount = round(Number(debt.originalAmount) - debt.paidAmount);

      if (debt.remainingAmount <= 0) {
        debt.remainingAmount = 0;
        debt.status = DebtStatus.PAID;
        debt.settledAt = now;
      }

      const updatedDebt = await manager.save(debt);

      this.logger.log(
        `Collected payment of ${dto.amount} for debt ${debtId} (remaining=${updatedDebt.remainingAmount})`,
      );

      return updatedDebt;
    });
  }

  async getPaymentHistory(
    debtId: string,
    actor: ActorContext,
  ): Promise<DebtPaymentEntity[]> {
    const debt = await this.debtRepo.findOne({
      where: { id: debtId, organizationId: actor.organizationId },
    });

    if (!debt) {
      throw new NotFoundException(`Debt record ${debtId} not found`);
    }

    return this.paymentRepo.find({
      where: { debtId },
      order: { paidAt: 'DESC' },
    });
  }
}
