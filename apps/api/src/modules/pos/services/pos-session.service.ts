import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, EntityManager } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { SessionStatus, WsEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PosSessionEntity, SessionReconciliationEntity } from '../entities';
import { OpenSessionDto, SubmitReconciliationDto } from '../dto';
import { CashAccountEntity, CashAccountType } from '../../accounting/cash/cash-account.entity';
import {
  CashMovementEntity,
  CashMovementType,
} from '../../accounting/cash/cash-movement.entity';

const VARIANCE_THRESHOLD = Number(process.env.POS_VARIANCE_THRESHOLD ?? '50');

@Injectable()
export class PosSessionService {
  private readonly logger = new Logger(PosSessionService.name);

  constructor(
    @InjectRepository(PosSessionEntity)
    private readonly sessionRepo: Repository<PosSessionEntity>,
    @InjectRepository(SessionReconciliationEntity)
    private readonly reconciliationRepo: Repository<SessionReconciliationEntity>,
    @InjectRepository(CashAccountEntity)
    private readonly cashAccountRepo: Repository<CashAccountEntity>,
    @InjectRepository(CashMovementEntity)
    private readonly cashMovementRepo: Repository<CashMovementEntity>,
    private readonly wsEmitter: WebSocketEmitterService,
  ) {}

  async openSession(
    dto: OpenSessionDto,
    actor: ActorContext,
  ): Promise<PosSessionEntity> {
    const cashAccount = await this.cashAccountRepo.findOne({
      where: { id: dto.cashAccountId, organizationId: actor.organizationId },
    });
    if (!cashAccount) {
      throw new NotFoundException(`Cash account ${dto.cashAccountId} not found`);
    }
    if (cashAccount.type !== CashAccountType.REGISTER) {
      throw new BadRequestException(
        'Only REGISTER cash accounts can be linked to POS sessions',
      );
    }
    if (cashAccount.branchId !== dto.branchId) {
      throw new BadRequestException(
        'Cash account branch mismatch — cash_account must belong to the same branch as the session',
      );
    }

    const activeSession = await this.sessionRepo.findOne({
      where: {
        cashAccountId: dto.cashAccountId,
        organizationId: actor.organizationId,
        status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
      },
    });
    if (activeSession) {
      throw new ConflictException(
        `Cash account "${cashAccount.name}" is already in use by session ${activeSession.id}`,
      );
    }

    const now = new Date();
    const session = this.sessionRepo.create({
      organizationId: actor.organizationId,
      branchId: dto.branchId,
      createdBy: actor.userId,
      terminalId: dto.terminalId,
      cashAccountId: dto.cashAccountId,
      status: SessionStatus.OPEN,
      openedBy: actor.userId,
      openedAt: now,
      openingCashAmount: dto.openingCashAmount,
    });

    const saved = await this.sessionRepo.save(session);
    this.logger.log(
      `Opened POS session ${saved.id} (branch=${dto.branchId}, cash_account=${dto.cashAccountId}, org=${actor.organizationId})`,
    );
    return saved;
  }

  /**
   * Phiên đang bán của một chi nhánh, cho các đường `/mobile/cashier/*` và
   * `approve` của đơn tư vấn (erp_sales, ADR-31): app KHÔNG gửi `sessionId`,
   * server tự tra. Ưu tiên phiên do CHÍNH người gọi mở; không có thì phiên mở
   * gần nhất của chi nhánh. Không có phiên → `ConflictException` mang mã
   * `NO_OPEN_SESSION` — app đọc MÃ để đưa người dùng sang màn Mở ca, không đọc câu.
   */
  async findOpenForBranch(
    branchId: string,
    actor: ActorContext,
    manager?: EntityManager,
  ): Promise<PosSessionEntity> {
    const repo = manager ? manager.getRepository(PosSessionEntity) : this.sessionRepo;
    const open = await repo.find({
      where: {
        organizationId: actor.organizationId,
        branchId,
        status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
      },
      order: { openedAt: 'DESC' },
    });
    const mine = open.find((s) => s.openedBy === actor.userId);
    const session = mine ?? open[0];
    if (!session) {
      throw new ConflictException({
        code: 'NO_OPEN_SESSION',
        message: 'Chi nhánh chưa mở ca. Mở ca trước khi thu tiền.',
      });
    }
    if (!mine && open.length > 1) {
      this.logger.warn(
        `Branch ${branchId} has ${open.length} open sessions; using latest ${session.id} for user ${actor.userId}`,
      );
    }
    return session;
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

  /**
   * Mở LẠI một phiên đang đóng dở (`CLOSING → ACTIVE_SALES`) — nút HỦY BỎ của
   * màn Đóng ca trên mobile (A-68): màn đó gọi `startClose` ngay lúc mở để có
   * "Tiền thu trong ca", nên bấm HỦY BỎ mà không có đường này là ca kẹt ở
   * CLOSING, không bán tiếp được.
   *
   * Idempotent: phiên đang bán → trả về nguyên (bấm HỦY BỎ hai lần vẫn an toàn).
   * Đã `CLOSED` → 409. Bản kiểm kê đã nộp (nếu có) bị xoá — nó là của lượt
   * đóng vừa bỏ.
   */
  async reopen(sessionId: string, actor: ActorContext): Promise<PosSessionEntity> {
    const session = await this.findOrFail(sessionId, actor);
    if (session.status === SessionStatus.OPEN || session.status === SessionStatus.ACTIVE_SALES) {
      return session;
    }
    if (session.status !== SessionStatus.CLOSING) {
      throw new ConflictException('Ca đã đóng, không mở lại được');
    }
    await this.reconciliationRepo.delete({ sessionId, organizationId: actor.organizationId });
    session.status = SessionStatus.ACTIVE_SALES;
    const saved = await this.sessionRepo.save(session);
    this.logger.log(`Session ${sessionId} reopened by ${actor.userId} (org=${actor.organizationId})`);
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

  /**
   * Compute expected cash for a session based on cash_movements bound to it.
   *
   * Formula:
   *   opening
   *   + sum(DEPOSIT | ADJUSTMENT where session_id = X)
   *   - sum(WITHDRAWAL where session_id = X)
   *   - sum(TRANSFER where cash_account_id = session.cash_account_id)   // outflow
   *   + sum(TRANSFER where to_account_id = session.cash_account_id     // inflow,
   *                       AND created_at between session open/close)
   */
  /** Bản public của [calculateExpectedCash] cho `/mobile/cashier/session` khi phiên đang CLOSING. */
  expectedCashOf(session: PosSessionEntity): Promise<number> {
    return this.calculateExpectedCash(session);
  }

  private async calculateExpectedCash(
    session: PosSessionEntity,
  ): Promise<number> {
    const opening = Number(session.openingCashAmount ?? 0);

    if (!session.cashAccountId) {
      // Legacy session without a linked cash_account — degrade gracefully to opening
      // (sale/return tables no longer exist after EPIC-011 cleanup).
      this.logger.warn(
        `Session ${session.id} has no cashAccountId; expectedCash falls back to opening only`,
      );
      return Number(opening.toFixed(2));
    }

    const movements = await this.cashMovementRepo.find({
      where: { sessionId: session.id, organizationId: session.organizationId },
    });

    let delta = 0;
    for (const m of movements) {
      const amt = Number(m.amount);
      if (m.type === CashMovementType.DEPOSIT || m.type === CashMovementType.ADJUSTMENT) {
        delta += amt;
      } else if (m.type === CashMovementType.WITHDRAWAL) {
        delta -= amt;
      } else if (m.type === CashMovementType.TRANSFER) {
        // Movement is bound to source (cashAccountId). Inflow handled below.
        if (m.cashAccountId === session.cashAccountId) {
          delta -= amt;
        }
      }
    }

    // Incoming transfers: toAccountId = session.cashAccountId, occurring between
    // session open and close (may have a different sessionId or none).
    const transferIns = await this.cashMovementRepo
      .createQueryBuilder('m')
      .where('m.organizationId = :orgId', { orgId: session.organizationId })
      .andWhere('m.type = :type', { type: CashMovementType.TRANSFER })
      .andWhere('m.toAccountId = :dest', { dest: session.cashAccountId })
      .andWhere('m.createdAt >= :openedAt', { openedAt: session.openedAt })
      .andWhere(
        session.closedAt
          ? 'm.createdAt <= :closedAt'
          : 'm.createdAt <= NOW()',
        session.closedAt ? { closedAt: session.closedAt } : {},
      )
      .getMany();

    for (const t of transferIns) {
      delta += Number(t.amount);
    }

    return Number((opening + delta).toFixed(2));
  }
}
