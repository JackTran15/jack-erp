import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  TransferStatus,
  StockMovementType,
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockTransferEntity } from './stock-transfer.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';

export interface CreateTransferDto {
  sourceLocationId: string;
  destinationLocationId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  lines: { itemId: string; quantity: number; notes?: string }[];
}

export interface TransferQuery extends PaginationQuery {
  status?: TransferStatus;
  organizationId: string;
  branchId?: string;
}

const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  [TransferStatus.DRAFT]: [TransferStatus.APPROVED, TransferStatus.CANCELLED],
  [TransferStatus.APPROVED]: [TransferStatus.POSTED, TransferStatus.CANCELLED],
  [TransferStatus.POSTED]: [],
  [TransferStatus.CANCELLED]: [],
};

@Injectable()
export class StockTransferService {
  private readonly logger = new Logger(StockTransferService.name);

  constructor(
    @InjectRepository(StockTransferEntity)
    private readonly transferRepo: Repository<StockTransferEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
  ) {}

  async create(
    dto: CreateTransferDto,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new BadRequestException(
        'Source and destination locations must be different',
      );
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one transfer line is required');
    }

    for (const line of dto.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException(
          'All line quantities must be positive',
        );
      }
    }

    const transfer = this.transferRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      sourceLocationId: dto.sourceLocationId,
      destinationLocationId: dto.destinationLocationId,
      sourceBranchId: dto.sourceBranchId,
      destinationBranchId: dto.destinationBranchId,
      status: TransferStatus.DRAFT,
      notes: dto.notes,
      createdBy: actor.userId,
      lines: dto.lines.map((l) => {
        const line = new StockTransferLineEntity();
        line.itemId = l.itemId;
        line.quantity = l.quantity;
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.transferRepo.save(transfer);
    this.logger.log(`Transfer ${saved.id} created as DRAFT`);
    return saved;
  }

  async approve(
    id: string,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(transfer.status, TransferStatus.APPROVED);

    transfer.status = TransferStatus.APPROVED;
    transfer.approvedBy = actor.userId;
    transfer.approvedAt = new Date();

    const saved = await this.transferRepo.save(transfer);
    this.logger.log(`Transfer ${id} approved by ${actor.userId}`);
    return saved;
  }

  async post(
    id: string,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(transfer.status, TransferStatus.POSTED);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.TRANSFER,
      transfer.sourceBranchId,
      actor,
    );

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];

      for (const line of transfer.lines) {
        movements.push({
          itemId: line.itemId,
          locationId: transfer.sourceLocationId,
          branchId: transfer.sourceBranchId,
          organizationId: transfer.organizationId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: -line.quantity,
          referenceType: 'TRANSFER',
          referenceId: transfer.id,
          notes: `Transfer out: ${documentNumber}`,
          actorContext: actor,
        });

        movements.push({
          itemId: line.itemId,
          locationId: transfer.destinationLocationId,
          branchId: transfer.destinationBranchId,
          organizationId: transfer.organizationId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: line.quantity,
          referenceType: 'TRANSFER',
          referenceId: transfer.id,
          notes: `Transfer in: ${documentNumber}`,
          actorContext: actor,
        });
      }

      await this.ledgerService.recordBatchMovements(movements);

      await manager.update(StockTransferEntity, id, {
        status: TransferStatus.POSTED,
        documentNumber,
        postedBy: actor.userId,
        postedAt: new Date(),
      });
    });

    this.logger.log(`Transfer ${id} posted as ${documentNumber}`);
    return this.findOrFail(id, actor.organizationId);
  }

  async cancel(
    id: string,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(transfer.status, TransferStatus.CANCELLED);

    transfer.status = TransferStatus.CANCELLED;
    const saved = await this.transferRepo.save(transfer);
    this.logger.log(`Transfer ${id} cancelled by ${actor.userId}`);
    return saved;
  }

  async getById(
    id: string,
    organizationId: string,
  ): Promise<StockTransferEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(
    query: TransferQuery,
  ): Promise<PaginatedResponse<StockTransferEntity>> {
    const where: Record<string, unknown> = {
      organizationId: query.organizationId,
    };
    if (query.status) where.status = query.status;
    if (query.branchId) where.branchId = query.branchId;

    const [data, total] = await this.transferRepo.findAndCount({
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

  private async findOrFail(
    id: string,
    organizationId: string,
  ): Promise<StockTransferEntity> {
    const transfer = await this.transferRepo.findOne({
      where: { id, organizationId },
    });
    if (!transfer) {
      throw new NotFoundException(`Stock transfer ${id} not found`);
    }
    return transfer;
  }

  private validateTransition(
    current: TransferStatus,
    target: TransferStatus,
  ): void {
    if (!VALID_TRANSITIONS[current].includes(target)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${target}`,
      );
    }
  }
}
