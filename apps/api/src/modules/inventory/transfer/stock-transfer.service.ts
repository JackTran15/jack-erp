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
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockTransferEntity } from './stock-transfer.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';
import { LocationEntity } from '../location/location.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { CreateIntraWarehouseTransferDto } from './create-intra-warehouse-transfer.dto';

/** A fully-resolved intra-warehouse move line: source/dest are concrete location ids. */
export interface IntraWarehouseMoveLine {
  itemId: string;
  quantity: number;
  sourceLocationId: string;
  destinationLocationId: string;
  notes?: string;
}

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

// MISA lifecycle: a DRAFT posts directly to the ledger (no separate Duyệt step).
// APPROVED is retained in the shared enum but is unreachable here.
const VALID_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  [TransferStatus.DRAFT]: [TransferStatus.POSTED, TransferStatus.CANCELLED],
  [TransferStatus.APPROVED]: [],
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
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
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

    // Assign the document number up-front so a fresh DRAFT already carries a
    // Số phiếu chuyển. post() must NOT generate a second number —
    // document_number has a UNIQUE constraint.
    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.TRANSFER,
      dto.sourceBranchId,
      actor,
    );

    const transfer = this.transferRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      documentNumber,
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
    this.logger.log(`Transfer ${saved.id} created as DRAFT ${documentNumber}`);
    return this.findOrFail(saved.id, actor.organizationId);
  }

  /**
   * Create then immediately post in one logical action (MISA "Lưu" = lưu + thực
   * hiện). The HTTP create endpoint uses this so a saved phiếu lands POSTED with
   * its Số phiếu and both ledger legs written.
   *
   * `recordBatchMovements` opens its own transaction, so this is not a single
   * DB transaction. To guarantee "POSTED or nothing persisted", a failed post()
   * hard-deletes the orphan DRAFT (lines cascade) before re-throwing the
   * original error — typically insufficient source on-hand.
   *
   * create()/post() stay independently callable so the temp-warehouse consumer
   * (which calls them directly and must not double-post) is unaffected.
   */
  async createAndPost(
    dto: CreateTransferDto,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const draft = await this.create(dto, actor);
    try {
      return await this.post(draft.id, actor);
    } catch (err) {
      // Roll back the just-created DRAFT so no orphan (without ledger) lingers.
      await this.transferRepo.delete({ id: draft.id }).catch((cleanupErr) => {
        this.logger.error(
          `Failed to clean up orphan DRAFT ${draft.id} after post failure: ${
            cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
          }`,
        );
      });
      if (err instanceof BadRequestException) {
        throw new BadRequestException(
          `Không thể chuyển kho: ${err.message}. Kiểm tra tồn kho tại vị trí xuất.`,
        );
      }
      throw err;
    }
  }

  /**
   * Update a DRAFT transfer in place. Rejected once the document has left
   * DRAFT — posted documents are immutable; corrections go via reversal.
   * The document number is preserved (never re-generated).
   */
  async update(
    id: string,
    dto: CreateTransferDto,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ sửa được phiếu chuyển kho ở trạng thái nháp',
      );
    }
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
        throw new BadRequestException('All line quantities must be positive');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(StockTransferEntity, id, {
        sourceLocationId: dto.sourceLocationId,
        destinationLocationId: dto.destinationLocationId,
        sourceBranchId: dto.sourceBranchId,
        destinationBranchId: dto.destinationBranchId,
        notes: dto.notes,
      });

      // Replace lines wholesale — a DRAFT has no ledger impact yet.
      await manager.delete(StockTransferLineEntity, { transferId: id });
      const lines = dto.lines.map((l) => {
        const line = new StockTransferLineEntity();
        line.transferId = id;
        line.itemId = l.itemId;
        line.quantity = l.quantity;
        line.sourceLocationId = l.sourceLocationId ?? dto.sourceLocationId;
        line.destinationLocationId =
          l.destinationLocationId ?? dto.destinationLocationId;
        line.notes = l.notes;
        return line;
      });
      await manager.save(StockTransferLineEntity, lines);
    });

    this.logger.log(`Transfer ${id} updated by ${actor.userId}`);
    return this.findOrFail(id, actor.organizationId);
  }

  async post(
    id: string,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(transfer.status, TransferStatus.POSTED);

    // Number was assigned on create(); reuse it (UNIQUE constraint forbids re-gen).
    const documentNumber = transfer.documentNumber;

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
   * Resolves each line's effective source/destination (line override → header
   * fallback), then delegates to {@link postIntraWarehouseMoves}.
   */
  async createIntraWarehouseTransferAndPost(
    dto: CreateIntraWarehouseTransferDto,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const lines: IntraWarehouseMoveLine[] = dto.lines.map((l, idx) => {
      const sourceLocationId = l.sourceLocationId ?? dto.sourceLocationId;
      const destinationLocationId =
        l.destinationLocationId ?? dto.destinationLocationId;

      if (!sourceLocationId) {
        throw new BadRequestException(
          `Dòng ${idx + 1}: thiếu vị trí nguồn (chưa chọn vị trí hiện tại).`,
        );
      }
      if (!destinationLocationId) {
        throw new BadRequestException(
          `Dòng ${idx + 1}: thiếu vị trí đích (chưa chọn vị trí chuyển đến).`,
        );
      }

      return {
        itemId: l.itemId,
        quantity: l.quantity,
        sourceLocationId,
        destinationLocationId,
        notes: l.notes,
      };
    });

    return this.postIntraWarehouseMoves(lines, actor);
  }

  /**
   * Shared entry point for every intra-warehouse move (Chuyển vị trí, and the
   * arrange flow which passes the "Chưa xếp" location as each line's source).
   *
   * Validates per line: positive quantity, source ≠ dest, both locations exist
   * in the actor's org and share the same storage, and that the on-hand quantity
   * at each (item, source) is sufficient. The on-hand check reads stock balances
   * with a pessimistic write lock (SELECT … FOR UPDATE) inside the same
   * transaction that writes the ledger, so concurrent moves cannot oversell.
   *
   * All-or-nothing: any failed line aborts the whole posting (nothing is written).
   * On success the transfer is created → approved → posted (immutable) and returned.
   */
  async postIntraWarehouseMoves(
    lines: IntraWarehouseMoveLine[],
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    if (!lines || lines.length === 0) {
      throw new BadRequestException('Cần ít nhất một dòng để chuyển vị trí');
    }

    if (!actor.branchId) {
      throw new BadRequestException(
        'Vui lòng chọn chi nhánh trước khi chuyển vị trí',
      );
    }

    for (const [idx, line] of lines.entries()) {
      if (!(line.quantity > 0)) {
        throw new BadRequestException(
          `Dòng ${idx + 1}: số lượng chuyển phải lớn hơn 0`,
        );
      }
      if (line.sourceLocationId === line.destinationLocationId) {
        throw new BadRequestException(
          `Dòng ${idx + 1}: vị trí nguồn và đích phải khác nhau`,
        );
      }
    }

    // Load every distinct location referenced and validate org + same-storage.
    const locationIds = [
      ...new Set(
        lines.flatMap((l) => [l.sourceLocationId, l.destinationLocationId]),
      ),
    ];
    const locations = await this.locationRepo.find({
      where: locationIds.map((id) => ({
        id,
        organizationId: actor.organizationId,
      })),
    });
    const locationById = new Map(locations.map((loc) => [loc.id, loc]));

    for (const [idx, line] of lines.entries()) {
      const source = locationById.get(line.sourceLocationId);
      const dest = locationById.get(line.destinationLocationId);
      if (!source) {
        throw new NotFoundException(
          `Dòng ${idx + 1}: vị trí nguồn không tồn tại`,
        );
      }
      if (!dest) {
        throw new NotFoundException(
          `Dòng ${idx + 1}: vị trí đích không tồn tại`,
        );
      }
      if (source.storageId !== dest.storageId) {
        throw new BadRequestException(
          `Dòng ${idx + 1}: vị trí nguồn và đích phải cùng một kho.`,
        );
      }
    }

    // Required quantity per (item, source) — same pair across lines is summed.
    const requiredByKey = new Map<string, { itemId: string; sourceLocationId: string; quantity: number }>();
    for (const line of lines) {
      const key = `${line.itemId}::${line.sourceLocationId}`;
      const existing = requiredByKey.get(key);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        requiredByKey.set(key, {
          itemId: line.itemId,
          sourceLocationId: line.sourceLocationId,
          quantity: line.quantity,
        });
      }
    }

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.TRANSFER,
      actor.branchId,
      actor,
    );

    const { transferId, ledgerEntries } = await this.dataSource.transaction(
      async (manager) => {
        // Lock + validate on-hand at each (item, source) before any write.
        for (const req of requiredByKey.values()) {
          const balance = await manager
            .createQueryBuilder(StockBalanceEntity, 'sb')
            .setLock('pessimistic_write')
            .where('sb.organization_id = :organizationId', {
              organizationId: actor.organizationId,
            })
            .andWhere('sb.item_id = :itemId', { itemId: req.itemId })
            .andWhere('sb.location_id = :locationId', {
              locationId: req.sourceLocationId,
            })
            .getOne();

          const onHand = balance ? Number(balance.quantity) : 0;
          if (req.quantity > onHand) {
            const loc = locationById.get(req.sourceLocationId);
            const locLabel = loc ? `${loc.name} (${loc.code})` : req.sourceLocationId;
            throw new BadRequestException(
              `Không đủ tồn để chuyển: hàng ${req.itemId} tại vị trí ${locLabel} ` +
                `chỉ còn ${onHand}, cần chuyển ${req.quantity}.`,
            );
          }
        }

        // Create the posted transfer record within the locked transaction.
        const transfer = manager.create(StockTransferEntity, {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          sourceLocationId: lines[0].sourceLocationId,
          destinationLocationId: lines[0].destinationLocationId,
          sourceBranchId: actor.branchId,
          destinationBranchId: actor.branchId,
          status: TransferStatus.POSTED,
          documentNumber,
          createdBy: actor.userId,
          approvedBy: actor.userId,
          approvedAt: new Date(),
          postedBy: actor.userId,
          postedAt: new Date(),
          lines: lines.map((l) => {
            const line = new StockTransferLineEntity();
            line.itemId = l.itemId;
            line.quantity = l.quantity;
            line.sourceLocationId = l.sourceLocationId;
            line.destinationLocationId = l.destinationLocationId;
            line.notes = l.notes;
            return line;
          }),
        });
        const savedTransfer = await manager.save(StockTransferEntity, transfer);

        const movements: RecordMovementParams[] = [];
        for (const line of lines) {
          movements.push({
            itemId: line.itemId,
            locationId: line.sourceLocationId,
            branchId: actor.branchId!,
            organizationId: actor.organizationId,
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -line.quantity,
            referenceType: 'TRANSFER',
            referenceId: savedTransfer.id,
            notes: `Transfer out: ${documentNumber}`,
            actorContext: actor,
            // Source & dest are two shelves of the same product/storage — the
            // one-shelf-per-product PSL guard must not run on transfer legs.
            skipLocationAssignment: true,
          });
          movements.push({
            itemId: line.itemId,
            locationId: line.destinationLocationId,
            branchId: actor.branchId!,
            organizationId: actor.organizationId,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: line.quantity,
            referenceType: 'TRANSFER',
            referenceId: savedTransfer.id,
            notes: `Transfer in: ${documentNumber}`,
            actorContext: actor,
            skipLocationAssignment: true,
          });
        }

        // Reuse the ledger writer on this same locked transaction; events are
        // published after commit so a rollback never leaks an event.
        const entries = await this.ledgerService.recordBatchMovements(
          movements,
          manager,
        );

        return { transferId: savedTransfer.id, ledgerEntries: entries };
      },
    );

    await this.ledgerService.publishMovementEvents(ledgerEntries);

    this.logger.log(
      `Intra-warehouse transfer ${transferId} posted as ${documentNumber}`,
    );
    return this.findOrFail(transferId, actor.organizationId);
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
