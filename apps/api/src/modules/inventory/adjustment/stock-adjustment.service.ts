import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import {
  StockMovementType,
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockAdjustmentEntity, AdjustmentStatus } from './stock-adjustment.entity';
import { StockAdjustmentLineEntity } from './stock-adjustment-line.entity';

export interface CreateAdjustmentDto {
  locationId: string;
  branchId: string;
  reasonCode: string;
  reasonDescription?: string;
  notes?: string;
  lines: { itemId: string; quantity: number; notes?: string }[];
}

export interface AdjustmentQuery extends PaginationQuery {
  status?: AdjustmentStatus;
  organizationId: string;
  branchId?: string;
}

const VALID_TRANSITIONS: Record<AdjustmentStatus, AdjustmentStatus[]> = {
  [AdjustmentStatus.DRAFT]: [AdjustmentStatus.PENDING_APPROVAL, AdjustmentStatus.POSTED, AdjustmentStatus.CANCELLED],
  [AdjustmentStatus.PENDING_APPROVAL]: [AdjustmentStatus.POSTED, AdjustmentStatus.CANCELLED],
  [AdjustmentStatus.POSTED]: [],
  [AdjustmentStatus.CANCELLED]: [],
};

@Injectable()
export class StockAdjustmentService {
  private readonly logger = new Logger(StockAdjustmentService.name);
  private readonly approvalThreshold: number;

  constructor(
    @InjectRepository(StockAdjustmentEntity)
    private readonly adjustmentRepo: Repository<StockAdjustmentEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly configService: ConfigService,
  ) {
    this.approvalThreshold = this.configService.get<number>(
      'ADJUSTMENT_APPROVAL_THRESHOLD',
      100,
    );
  }

  async create(
    dto: CreateAdjustmentDto,
    actor: ActorContext,
  ): Promise<StockAdjustmentEntity> {
    if (!dto.reasonCode) {
      throw new BadRequestException('Reason code is required for adjustments');
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one adjustment line is required');
    }
    for (const line of dto.lines) {
      if (line.quantity === 0) {
        throw new BadRequestException('Line quantity must not be zero');
      }
    }

    const adjustment = this.adjustmentRepo.create({
      organizationId: actor.organizationId,
      branchId: dto.branchId,
      locationId: dto.locationId,
      reasonCode: dto.reasonCode,
      reasonDescription: dto.reasonDescription,
      status: AdjustmentStatus.DRAFT,
      notes: dto.notes,
      createdBy: actor.userId,
      lines: dto.lines.map((l) => {
        const line = new StockAdjustmentLineEntity();
        line.itemId = l.itemId;
        line.quantity = l.quantity;
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.adjustmentRepo.save(adjustment);
    this.logger.log(`Adjustment ${saved.id} created as DRAFT`);
    return saved;
  }

  async submit(
    id: string,
    actor: ActorContext,
  ): Promise<StockAdjustmentEntity> {
    const adjustment = await this.findOrFail(id, actor.organizationId);

    if (adjustment.status !== AdjustmentStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot submit adjustment in ${adjustment.status} status`,
      );
    }

    const requiresApproval = this.exceedsThreshold(adjustment);

    if (requiresApproval) {
      this.validateTransition(adjustment.status, AdjustmentStatus.PENDING_APPROVAL);
      adjustment.status = AdjustmentStatus.PENDING_APPROVAL;
      const saved = await this.adjustmentRepo.save(adjustment);
      this.logger.log(
        `Adjustment ${id} submitted for approval (threshold exceeded)`,
      );
      return saved;
    }

    return this.postInternal(adjustment, actor);
  }

  async approve(
    id: string,
    actor: ActorContext,
  ): Promise<StockAdjustmentEntity> {
    const adjustment = await this.findOrFail(id, actor.organizationId);

    if (adjustment.status !== AdjustmentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve adjustment in ${adjustment.status} status`,
      );
    }

    return this.postInternal(adjustment, actor, true);
  }

  async post(
    id: string,
    actor: ActorContext,
  ): Promise<StockAdjustmentEntity> {
    const adjustment = await this.findOrFail(id, actor.organizationId);

    if (adjustment.status === AdjustmentStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'This adjustment requires approval before posting. Use the approve endpoint.',
      );
    }

    if (adjustment.status !== AdjustmentStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot post adjustment in ${adjustment.status} status`,
      );
    }

    return this.postInternal(adjustment, actor);
  }

  async cancel(
    id: string,
    actor: ActorContext,
  ): Promise<StockAdjustmentEntity> {
    const adjustment = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(adjustment.status, AdjustmentStatus.CANCELLED);

    adjustment.status = AdjustmentStatus.CANCELLED;
    const saved = await this.adjustmentRepo.save(adjustment);
    this.logger.log(`Adjustment ${id} cancelled by ${actor.userId}`);
    return saved;
  }

  async getById(
    id: string,
    organizationId: string,
  ): Promise<StockAdjustmentEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(
    query: AdjustmentQuery,
  ): Promise<PaginatedResponse<StockAdjustmentEntity>> {
    const where: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.status) where.status = query.status;
    if (query.branchId) where.branchId = query.branchId;

    const [data, total] = await this.adjustmentRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async postInternal(
    adjustment: StockAdjustmentEntity,
    actor: ActorContext,
    isApproval = false,
  ): Promise<StockAdjustmentEntity> {
    this.validateTransition(adjustment.status, AdjustmentStatus.POSTED);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.ADJUSTMENT,
      adjustment.branchId,
      actor,
    );

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];

      for (const line of adjustment.lines) {
        const isIncrease = line.quantity > 0;
        movements.push({
          itemId: line.itemId,
          locationId: adjustment.locationId,
          branchId: adjustment.branchId!,
          organizationId: adjustment.organizationId,
          movementType: isIncrease
            ? StockMovementType.ADJUSTMENT_INCREASE
            : StockMovementType.ADJUSTMENT_DECREASE,
          quantity: line.quantity,
          referenceType: 'ADJUSTMENT',
          referenceId: adjustment.id,
          notes: `Adjustment ${documentNumber}: ${adjustment.reasonCode}`,
          actorContext: actor,
        });
      }

      await this.ledgerService.recordBatchMovements(movements);

      const updatePayload: Partial<StockAdjustmentEntity> = {
        status: AdjustmentStatus.POSTED,
        documentNumber,
        postedBy: actor.userId,
        postedAt: new Date(),
      };

      if (isApproval) {
        updatePayload.approvedBy = actor.userId;
        updatePayload.approvedAt = new Date();
      }

      await manager.update(StockAdjustmentEntity, adjustment.id, updatePayload);
    });

    this.logger.log(`Adjustment ${adjustment.id} posted as ${documentNumber}`);
    return this.findOrFail(adjustment.id, adjustment.organizationId);
  }

  private exceedsThreshold(adjustment: StockAdjustmentEntity): boolean {
    const totalAbsQuantity = adjustment.lines.reduce(
      (sum, line) => sum + Math.abs(Number(line.quantity)),
      0,
    );
    return totalAbsQuantity > this.approvalThreshold;
  }

  private async findOrFail(
    id: string,
    organizationId: string,
  ): Promise<StockAdjustmentEntity> {
    const adjustment = await this.adjustmentRepo.findOne({
      where: { id, organizationId },
    });
    if (!adjustment) {
      throw new NotFoundException(`Stock adjustment ${id} not found`);
    }
    return adjustment;
  }

  private validateTransition(
    current: AdjustmentStatus,
    target: AdjustmentStatus,
  ): void {
    if (!VALID_TRANSITIONS[current].includes(target)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${target}`,
      );
    }
  }
}
