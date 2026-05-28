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
import { LocationEntity } from '../location/location.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { CreateIntraWarehouseTransferDto } from './create-intra-warehouse-transfer.dto';

export interface CreateTransferDto {
  sourceLocationId: string;
  destinationLocationId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  lines: {
    itemId: string;
    quantity: number;
    sourceLocationId?: string;
    destinationLocationId?: string;
    notes?: string;
  }[];
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
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
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
        line.sourceLocationId = l.sourceLocationId ?? dto.sourceLocationId;
        line.destinationLocationId =
          l.destinationLocationId ?? dto.destinationLocationId;
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

    // Snapshot `purchase_price` per item once at posting time so both legs of
    // the transfer (TRANSFER_OUT + TRANSFER_IN) carry the same unit_cost and
    // line_value sums net to zero across the move.
    const itemIds = Array.from(new Set(transfer.lines.map((l) => l.itemId)));
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      transfer.organizationId,
      itemIds,
    );

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];

      for (const line of transfer.lines) {
        const sourceLoc = line.sourceLocationId ?? transfer.sourceLocationId;
        const destLoc = line.destinationLocationId ?? transfer.destinationLocationId;
        const unitCost = itemCostByItemId.get(line.itemId) ?? 0;
        movements.push({
          itemId: line.itemId,
          locationId: sourceLoc,
          branchId: transfer.sourceBranchId,
          organizationId: transfer.organizationId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: -line.quantity,
          referenceType: 'TRANSFER',
          referenceId: transfer.id,
          notes: `Transfer out: ${documentNumber}`,
          actorContext: actor,
          unitCost,
        });

        movements.push({
          itemId: line.itemId,
          locationId: destLoc,
          branchId: transfer.destinationBranchId,
          organizationId: transfer.organizationId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: line.quantity,
          referenceType: 'TRANSFER',
          referenceId: transfer.id,
          notes: `Transfer in: ${documentNumber}`,
          actorContext: actor,
          unitCost,
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

  /**
   * Validates same-storage constraint, then creates → approves → posts
   * an intra-warehouse transfer in one shot.
   */
  async createIntraWarehouseTransferAndPost(
    dto: CreateIntraWarehouseTransferDto,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    // 1. Source and destination must differ
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new BadRequestException('Vị trí nguồn và đích phải khác nhau');
    }

    // 2. Both locations must exist in the actor's org
    const [source, dest] = await Promise.all([
      this.locationRepo.findOne({
        where: { id: dto.sourceLocationId, organizationId: actor.organizationId },
      }),
      this.locationRepo.findOne({
        where: { id: dto.destinationLocationId, organizationId: actor.organizationId },
      }),
    ]);

    if (!source) throw new NotFoundException('Vị trí nguồn không tồn tại');
    if (!dest) throw new NotFoundException('Vị trí đích không tồn tại');

    // 3. Both locations must belong to the same storage
    if (source.storageId !== dest.storageId) {
      throw new BadRequestException(
        'Chuyển vị trí trong cùng kho: 2 vị trí phải cùng một kho.',
      );
    }

    if (!actor.branchId) {
      throw new BadRequestException(
        'Vui lòng chọn chi nhánh trước khi chuyển vị trí',
      );
    }

    // 4. Build the CreateTransferDto
    const createDto: CreateTransferDto = {
      sourceBranchId: actor.branchId,
      destinationBranchId: actor.branchId,
      sourceLocationId: dto.sourceLocationId,
      destinationLocationId: dto.destinationLocationId,
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        notes: l.notes,
      })),
    };

    // 5. Run create → approve → post sequentially
    // Each step has its own save/transaction internally; we run them in sequence
    // so that a failure in any step stops the flow.
    const draft = await this.create(createDto, actor);
    await this.approve(draft.id, actor);
    return this.post(draft.id, actor);
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
