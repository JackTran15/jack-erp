import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { SessionStatus, PaymentMethod, WsEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PosSessionEntity, SaleEntity, ReturnEntity, SessionReconciliationEntity } from '../entities';
import { PaymentEntity } from '../entities';
import { OpenSessionDto, SubmitReconciliationDto } from '../dto';

const VARIANCE_THRESHOLD = Number(process.env.POS_VARIANCE_THRESHOLD ?? '50');

@Injectable()
export class PosSessionService {
  private readonly logger = new Logger(PosSessionService.name);

  constructor(
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    @InjectRepository(SaleEntity)
    private readonly saleRepo: Repository<SaleEntity>,
    @InjectRepository(ReturnEntity)
    private readonly returnRepo: Repository<ReturnEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SessionReconciliationEntity)
    private readonly reconciliationRepo: Repository<SessionReconciliationEntity>,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async openSession(
    dto: OpenSessionDto,
    actor: ActorContext,
  ): Promise<PosSessionEntity> {
    const now = new Date();
    const session = this.sessionRepo.create({
      organizationId: actor.organizationId,
      branchId: dto.branchId,
      createdBy: actor.userId,
      terminalId: dto.terminalId,
      status: SessionStatus.OPEN,
      openedBy: actor.userId,
      openedAt: now,
      openingCashAmount: dto.openingCashAmount,
    });

    const saved = await this.sessionRepo.save(session);
    this.logger.log(
      `Opened POS session ${saved.id} (branch=${dto.branchId}, org=${actor.organizationId})`,
    );
    return saved;
  }

  async startSales(
    sessionId: string,
    actor: ActorContext,
  ): Promise<PosSessionEntity> {
    const session = await this.findOrFail(sessionId, actor);

    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException(
        `Session ${sessionId} is ${session.status}, expected OPEN`,
      );
    }

    session.status = SessionStatus.ACTIVE_SALES;
    const saved = await this.sessionRepo.save(session);

    this.logger.log(
      `Session ${sessionId} transitioned to ACTIVE_SALES (org=${actor.organizationId})`,
    );
    return saved;
  }

  async startClose(
    sessionId: string,
    actor: ActorContext,
  ): Promise<{ session: PosSessionEntity; expectedCash: number }> {
    const session = await this.findOrFail(sessionId, actor);

    if (session.status !== SessionStatus.ACTIVE_SALES) {
      throw new BadRequestException(
        `Session ${sessionId} is ${session.status}, expected ACTIVE_SALES`,
      );
    }

    const expectedCash = await this.calculateExpectedCash(session);

    session.status = SessionStatus.CLOSING;
    const saved = await this.sessionRepo.save(session);

    this.logger.log(
      `Session ${sessionId} transitioned to CLOSING, expectedCash=${expectedCash} (org=${actor.organizationId})`,
    );

    return { session: saved, expectedCash };
  }

  async getReconciliation(
    sessionId: string,
    actor: ActorContext,
  ): Promise<SessionReconciliationEntity | null> {
    await this.findOrFail(sessionId, actor);

    return this.reconciliationRepo.findOne({
      where: { sessionId, organizationId: actor.organizationId },
    });
  }

  async submitReconciliation(
    sessionId: string,
    dto: SubmitReconciliationDto,
    actor: ActorContext,
  ): Promise<SessionReconciliationEntity> {
    const session = await this.findOrFail(sessionId, actor);

    if (session.status !== SessionStatus.CLOSING) {
      throw new BadRequestException(
        `Session ${sessionId} is ${session.status}, expected CLOSING`,
      );
    }

    const expectedCash = await this.calculateExpectedCash(session);
    const variance = Number((dto.actualCash - expectedCash).toFixed(2));
    const withinThreshold = Math.abs(variance) <= VARIANCE_THRESHOLD;

    let reconciliation = await this.reconciliationRepo.findOne({
      where: { sessionId, organizationId: actor.organizationId },
    });

    if (reconciliation) {
      reconciliation.actualCash = dto.actualCash;
      reconciliation.expectedCash = expectedCash;
      reconciliation.variance = variance;
      reconciliation.notes = dto.notes;
      reconciliation.varianceApproved = withinThreshold;
      if (withinThreshold) {
        reconciliation.approvedBy = actor.userId;
        reconciliation.approvedAt = new Date();
      } else {
        reconciliation.approvedBy = undefined;
        reconciliation.approvedAt = undefined;
      }
    } else {
      reconciliation = this.reconciliationRepo.create({
        organizationId: actor.organizationId,
        branchId: session.branchId,
        createdBy: actor.userId,
        sessionId,
        expectedCash,
        actualCash: dto.actualCash,
        variance,
        varianceApproved: withinThreshold,
        approvedBy: withinThreshold ? actor.userId : undefined,
        approvedAt: withinThreshold ? new Date() : undefined,
        notes: dto.notes,
      });
    }

    const saved = await this.reconciliationRepo.save(reconciliation);

    this.logger.log(
      `Reconciliation submitted for session ${sessionId}: expected=${expectedCash}, actual=${dto.actualCash}, variance=${variance}, autoApproved=${withinThreshold}`,
    );

    return saved;
  }

  async approveVariance(
    sessionId: string,
    actor: ActorContext,
  ): Promise<SessionReconciliationEntity> {
    if (!actor.permissions?.includes('pos.session.approve_variance')) {
      throw new ForbiddenException(
        'Supervisor permission required to approve variance',
      );
    }

    await this.findOrFail(sessionId, actor);

    const reconciliation = await this.reconciliationRepo.findOne({
      where: { sessionId, organizationId: actor.organizationId },
    });

    if (!reconciliation) {
      throw new NotFoundException(
        `No reconciliation found for session ${sessionId}`,
      );
    }

    if (reconciliation.varianceApproved) {
      throw new BadRequestException('Variance is already approved');
    }

    reconciliation.varianceApproved = true;
    reconciliation.approvedBy = actor.userId;
    reconciliation.approvedAt = new Date();

    const saved = await this.reconciliationRepo.save(reconciliation);

    this.logger.log(
      `Variance approved for session ${sessionId} by ${actor.userId} (variance=${reconciliation.variance})`,
    );

    return saved;
  }

  async finalizeClose(
    sessionId: string,
    actor: ActorContext,
  ): Promise<PosSessionEntity> {
    const session = await this.findOrFail(sessionId, actor);

    if (session.status !== SessionStatus.CLOSING) {
      throw new BadRequestException(
        `Session ${sessionId} is ${session.status}, expected CLOSING`,
      );
    }

    const reconciliation = await this.reconciliationRepo.findOne({
      where: { sessionId, organizationId: actor.organizationId },
    });

    if (!reconciliation) {
      throw new BadRequestException(
        'Cannot close session without reconciliation',
      );
    }

    if (!reconciliation.varianceApproved && reconciliation.variance !== 0) {
      throw new BadRequestException(
        `Variance of ${reconciliation.variance} requires supervisor approval before closing`,
      );
    }

    const now = new Date();
    session.status = SessionStatus.CLOSED;
    session.closedBy = actor.userId;
    session.closedAt = now;

    const saved = await this.sessionRepo.save(session);

    this.wsEmitter.emitToBranch(session.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.RECONCILIATION_COMPLETED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: session.branchId,
      correlationId: sessionId,
      payload: {
        sessionId,
        expectedCash: reconciliation.expectedCash,
        actualCash: reconciliation.actualCash,
        variance: reconciliation.variance,
        closedBy: actor.userId,
      },
    });

    this.logger.log(
      `Session ${sessionId} closed by ${actor.userId} (org=${actor.organizationId})`,
    );

    return saved;
  }

  async findOrFail(
    sessionId: string,
    actor: ActorContext,
  ): Promise<PosSessionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, organizationId: actor.organizationId },
    });
    if (!session) {
      throw new NotFoundException(`POS session ${sessionId} not found`);
    }
    return session;
  }

  private async calculateExpectedCash(
    session: PosSessionEntity,
  ): Promise<number> {
    const sales = await this.saleRepo.find({
      where: { sessionId: session.id, organizationId: session.organizationId },
      relations: ['payments'],
    });

    let cashIn = 0;
    for (const sale of sales) {
      for (const payment of sale.payments) {
        if (payment.method === PaymentMethod.CASH) {
          cashIn += Number(payment.amount);
        }
      }
    }

    const returns = await this.returnRepo.find({
      where: { sessionId: session.id, organizationId: session.organizationId },
    });

    let cashRefunds = 0;
    for (const ret of returns) {
      cashRefunds += Number(ret.totalAmount);
    }

    const expected = Number(session.openingCashAmount) + cashIn - cashRefunds;
    return Number(expected.toFixed(2));
  }
}
