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
import { StorageEntity } from '../location/storage.entity';
import { UserEntity } from '../../auth/user.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { StorageDefaultLocationResolverService } from '../location/storage-default-location-resolver.service';
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
  sourceLocationId?: string;
  destinationLocationId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  /** Person responsible for transporting the goods (validated to belong to the org). */
  transporterUserId?: string;
  /** Attachment ids (Tài liệu đính kèm). */
  attachmentIds?: string[];
  /** ISO timestamp the transfer takes place; defaults to posting time when omitted. */
  transferredAt?: string;
  lines: {
    itemId: string;
    quantity: number;
    /** Per-line source/destination storage — required on the branch-scoped HTTP path. */
    sourceStorageId?: string;
    destinationStorageId?: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    /** Export unit price; falls back to the snapshot item cost when omitted. */
    unitPrice?: number;
    notes?: string;
  }[];
}

/**
 * HTTP request shape for a branch-scoped (Kho → Kho) transfer. The branch and
 * header locations are derived by the service, so the client only sends per-line
 * storages/locations plus document metadata.
 */
export interface BranchScopedTransferInput {
  notes?: string;
  transporterUserId?: string;
  attachmentIds?: string[];
  transferredAt?: string;
  lines: {
    itemId: string;
    quantity: number;
    sourceStorageId: string;
    destinationStorageId: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    unitPrice?: number;
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
  // POSTED can be voided ("Xóa") via a reversing ledger entry, then CANCELLED.
  [TransferStatus.POSTED]: [TransferStatus.CANCELLED],
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
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
    private readonly storageDefaultLocationResolver: StorageDefaultLocationResolverService,
  ) {}

  async create(
    dto: CreateTransferDto,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    if (
      dto.sourceLocationId &&
      dto.sourceLocationId === dto.destinationLocationId
    ) {
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
      transporterUserId: dto.transporterUserId,
      attachmentIds: dto.attachmentIds ?? [],
      transferredAt: dto.transferredAt ? new Date(dto.transferredAt) : undefined,
      createdBy: actor.userId,
      lines: dto.lines.map((l) => {
        const line = new StockTransferLineEntity();
        line.itemId = l.itemId;
        line.quantity = l.quantity;
        line.sourceStorageId = l.sourceStorageId;
        line.destinationStorageId = l.destinationStorageId;
        line.sourceLocationId = l.sourceLocationId ?? dto.sourceLocationId;
        line.destinationLocationId =
          l.destinationLocationId ?? dto.destinationLocationId;
        line.unitPrice = l.unitPrice != null ? l.unitPrice.toFixed(2) : null;
        line.lineValue =
          l.unitPrice != null ? (l.unitPrice * l.quantity).toFixed(2) : null;
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.transferRepo.save(transfer);
    this.logger.log(`Transfer ${saved.id} created as DRAFT ${documentNumber}`);
    return this.findOrFail(saved.id, actor.organizationId);
  }

  /**
   * Normalize a branch-scoped (Kho → Kho) transfer request coming from the HTTP
   * surface: every line must name a source and destination storage, all storages
   * must belong to the actor's current branch (cross-branch transfers are the
   * transfer-order module's job), each missing Vị trí resolves to a concrete
   * active shelf (never the "Chưa xếp" bin), and each line is valued (snapshot cost when
   * the unit price is left blank). Returns a fully-resolved {@link CreateTransferDto}.
   */
  private async resolveBranchScopedTransfer(
    dto: BranchScopedTransferInput,
    actor: ActorContext,
  ): Promise<CreateTransferDto> {
    if (!actor.branchId) {
      throw new BadRequestException(
        'Please select a branch before creating a stock transfer',
      );
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one transfer line is required');
    }

    for (const [idx, l] of dto.lines.entries()) {
      if (!l.sourceStorageId) {
        throw new BadRequestException(`Line ${idx + 1}: source storage is required`);
      }
      if (!l.destinationStorageId) {
        throw new BadRequestException(
          `Line ${idx + 1}: destination storage is required`,
        );
      }
      if (!(l.quantity > 0)) {
        throw new BadRequestException(`Line ${idx + 1}: quantity must be positive`);
      }
    }

    // Load every referenced storage; assert org ownership + same branch.
    const storageIds = [
      ...new Set(
        dto.lines.flatMap((l) => [l.sourceStorageId!, l.destinationStorageId!]),
      ),
    ];
    const storages = await this.storageRepo.find({
      where: storageIds.map((id) => ({ id, organizationId: actor.organizationId })),
    });
    const storageById = new Map(storages.map((s) => [s.id, s]));

    for (const [idx, l] of dto.lines.entries()) {
      const src = storageById.get(l.sourceStorageId!);
      const dst = storageById.get(l.destinationStorageId!);
      if (!src) {
        throw new NotFoundException(`Line ${idx + 1}: source storage not found`);
      }
      if (!dst) {
        throw new NotFoundException(`Line ${idx + 1}: destination storage not found`);
      }
      if (src.branchId !== actor.branchId || dst.branchId !== actor.branchId) {
        console.error(
          `Line ${idx + 1}: source storage branch ${src.branchId} or destination ` +`storage branch ${dst.branchId} does not match actor branch ${actor.branchId}`,
        );
        throw new BadRequestException(
          'Stock transfer is only allowed between storages in the same branch',
        );
      }
    }

    if (dto.transporterUserId) {
      const transporter = await this.userRepo.findOne({
        where: {
          id: dto.transporterUserId,
          organizationId: actor.organizationId,
        },
      });
      if (!transporter) {
        throw new BadRequestException(
          'Transporter user not found in this organization',
        );
      }
    }

    // Resolve each storage's default shelf once — concrete bins only (not "Chưa xếp").
    const defaultByStorage = new Map<string, string>();
    const resolveDefaultLocation = async (storageId: string): Promise<string> => {
      const cached = defaultByStorage.get(storageId);
      if (cached) return cached;

      const locationId = await this.storageDefaultLocationResolver.resolveStorageTransferLocation(
        storageId,
        actor.organizationId,
        { errorLabel: storageById.get(storageId)?.name ?? storageId },
      );
      defaultByStorage.set(storageId, locationId);
      return locationId;
    };

    // Unit price falls back to the snapshot purchase cost when left blank.
    const itemIds = Array.from(new Set(dto.lines.map((l) => l.itemId)));
    const costByItemId = await this.itemCostSnapshotService.snapshotCosts(
      actor.organizationId,
      itemIds,
    );

    const lines: CreateTransferDto['lines'] = [];
    for (const [idx, l] of dto.lines.entries()) {
      const sourceLocationId =
        l.sourceLocationId ??
        (await resolveDefaultLocation(l.sourceStorageId!));
      if (l.sourceLocationId) {
        const srcLoc = await this.locationRepo.findOne({
          where: {
            id: l.sourceLocationId,
            organizationId: actor.organizationId,
            branchId: actor.branchId,
          },
          select: { id: true },
        });
        if (!srcLoc)
          throw new NotFoundException(`Line ${idx + 1}: source location not found`);
      }

      const destinationLocationId =
        l.destinationLocationId ??
        (await resolveDefaultLocation(l.destinationStorageId!));
      if (l.destinationLocationId) {
        const dstLoc = await this.locationRepo.findOne({
          where: {
            id: l.destinationLocationId,
            organizationId: actor.organizationId,
            branchId: actor.branchId,
          },
          select: { id: true },
        });
        if (!dstLoc)
          throw new NotFoundException(
            `Line ${idx + 1}: destination location not found`,
          );
      }
      if (
        sourceLocationId &&
        destinationLocationId &&
        sourceLocationId === destinationLocationId
      ) {
        throw new BadRequestException(
          `Line ${idx + 1}: source and destination must be different`,
        );
      }
      const unitPrice =
        l.unitPrice != null ? l.unitPrice : costByItemId.get(l.itemId) ?? 0;
      lines.push({
        itemId: l.itemId,
        quantity: l.quantity,
        sourceStorageId: l.sourceStorageId,
        destinationStorageId: l.destinationStorageId,
        sourceLocationId,
        destinationLocationId,
        unitPrice,
        notes: l.notes,
      });
    }

    return {
      sourceLocationId: lines.find((l) => l.sourceLocationId)?.sourceLocationId,
      destinationLocationId: lines[0].destinationLocationId!,
      sourceBranchId: actor.branchId,
      destinationBranchId: actor.branchId,
      transporterUserId: dto.transporterUserId,
      attachmentIds: dto.attachmentIds ?? [],
      transferredAt: dto.transferredAt,
      notes: dto.notes,
      lines,
    };
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
    dto: BranchScopedTransferInput,
    actor: ActorContext,
    opts: { validateOnHand?: boolean } = {},
  ): Promise<StockTransferEntity> {
    // HTTP path: each line carries its own Kho xuất/Kho nhập. Resolve them to
    // concrete locations, enforce same-branch, and value each line before the
    // shared create()/post() runs.
    const { validateOnHand } = opts;
    const resolved = await this.resolveBranchScopedTransfer(dto, actor);
    const draft = await this.create(resolved, actor);
    try {
      return await this.post(draft.id, actor, {
        validateOnHand: validateOnHand ?? true,
      });
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
   * Edit a transfer in place, preserving its id and document number.
   *  - CANCELLED: rejected (a voided doc cannot be edited).
   *  - DRAFT: lines/header replaced; no ledger impact yet.
   *  - POSTED: the immutable ledger is corrected by reversing the original
   *    movements (rollback the stock) and posting the new ones in a single
   *    transaction. A pessimistic net-delta check per (item, location) blocks
   *    the edit when it would drive any balance negative (the new source lacks
   *    stock, or the goods already left the old destination).
   */
  async update(
    id: string,
    dto: BranchScopedTransferInput,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a cancelled stock transfer');
    }

    // Same branch-scoped resolution as create: per-line storages, default
    // locations, same-branch enforcement and valuation.
    const resolved = await this.resolveBranchScopedTransfer(dto, actor);

    const headerPatch = {
      sourceLocationId: resolved.sourceLocationId,
      destinationLocationId: resolved.destinationLocationId,
      sourceBranchId: resolved.sourceBranchId,
      destinationBranchId: resolved.destinationBranchId,
      transporterUserId: resolved.transporterUserId,
      attachmentIds: resolved.attachmentIds ?? [],
      transferredAt: resolved.transferredAt
        ? new Date(resolved.transferredAt)
        : undefined,
      notes: resolved.notes,
    };

    const buildLineEntities = (): StockTransferLineEntity[] =>
      resolved.lines.map((l) => {
        const line = new StockTransferLineEntity();
        line.transferId = id;
        line.itemId = l.itemId;
        line.quantity = l.quantity;
        line.sourceStorageId = l.sourceStorageId;
        line.destinationStorageId = l.destinationStorageId;
        line.sourceLocationId = l.sourceLocationId;
        line.destinationLocationId = l.destinationLocationId;
        line.unitPrice = l.unitPrice != null ? l.unitPrice.toFixed(2) : null;
        line.lineValue =
          l.unitPrice != null ? (l.unitPrice * l.quantity).toFixed(2) : null;
        line.notes = l.notes;
        return line;
      });

    // DRAFT: no ledger impact yet — replace lines/header directly.
    if (transfer.status === TransferStatus.DRAFT) {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(StockTransferEntity, id, headerPatch);
        await manager.delete(StockTransferLineEntity, { transferId: id });
        await manager.save(StockTransferLineEntity, buildLineEntities());
      });
      this.logger.log(`Transfer ${id} updated (draft) by ${actor.userId}`);
      return this.findOrFail(id, actor.organizationId);
    }

    // POSTED: reverse the original movements then post the edited ones, keeping
    // the same document. Snapshot costs cover items in both old and new lines.
    const itemIds = Array.from(
      new Set([
        ...transfer.lines.map((l) => l.itemId),
        ...resolved.lines.map((l) => l.itemId),
      ]),
    );
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      transfer.organizationId,
      itemIds,
    );

    const movements: RecordMovementParams[] = [];

    // Reversal of the original lines: stock returns to the old source, leaves
    // the old destination.
    for (const line of transfer.lines) {
      const sourceLoc = line.sourceLocationId ?? transfer.sourceLocationId;
      const destLoc =
        line.destinationLocationId ?? transfer.destinationLocationId;
      if (!sourceLoc || !destLoc) {
        throw new BadRequestException(
          'Transfer line is missing a source or destination location',
        );
      }
      const unitCost =
        line.unitPrice != null
          ? Number(line.unitPrice)
          : itemCostByItemId.get(line.itemId) ?? 0;
      movements.push({
        itemId: line.itemId,
        locationId: sourceLoc,
        branchId: transfer.sourceBranchId,
        organizationId: transfer.organizationId,
        movementType: StockMovementType.TRANSFER_IN,
        quantity: line.quantity,
        referenceType: 'TRANSFER_EDIT_REVERSAL',
        referenceId: transfer.id,
        notes: `Transfer edit reversal in: ${transfer.documentNumber}`,
        actorContext: actor,
        unitCost,
      });
      movements.push({
        itemId: line.itemId,
        locationId: destLoc,
        branchId: transfer.destinationBranchId,
        organizationId: transfer.organizationId,
        movementType: StockMovementType.TRANSFER_OUT,
        quantity: -line.quantity,
        referenceType: 'TRANSFER_EDIT_REVERSAL',
        referenceId: transfer.id,
        notes: `Transfer edit reversal out: ${transfer.documentNumber}`,
        actorContext: actor,
        unitCost,
      });
    }

    // New posting from the edited (resolved) lines.
    for (const line of resolved.lines) {
      const unitCost =
        line.unitPrice != null
          ? Number(line.unitPrice)
          : itemCostByItemId.get(line.itemId) ?? 0;
      movements.push({
        itemId: line.itemId,
        locationId: line.sourceLocationId!,
        branchId: resolved.sourceBranchId,
        organizationId: transfer.organizationId,
        movementType: StockMovementType.TRANSFER_OUT,
        quantity: -line.quantity,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        notes: `Transfer out: ${transfer.documentNumber}`,
        actorContext: actor,
        unitCost,
      });
      movements.push({
        itemId: line.itemId,
        locationId: line.destinationLocationId!,
        branchId: resolved.destinationBranchId,
        organizationId: transfer.organizationId,
        movementType: StockMovementType.TRANSFER_IN,
        quantity: line.quantity,
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        notes: `Transfer in: ${transfer.documentNumber}`,
        actorContext: actor,
        unitCost,
      });
    }

    // Net change per (item, location) across reversal + new posting. Only
    // locations that lose stock (delta < 0) can go negative.
    const netByKey = new Map<
      string,
      { itemId: string; locationId: string; delta: number }
    >();
    for (const m of movements) {
      const key = `${m.itemId}::${m.locationId}`;
      const existing = netByKey.get(key);
      if (existing) {
        existing.delta += m.quantity;
      } else {
        netByKey.set(key, {
          itemId: m.itemId,
          locationId: m.locationId,
          delta: m.quantity,
        });
      }
    }

    const entries = await this.dataSource.transaction(async (manager) => {
      for (const n of netByKey.values()) {
        if (n.delta >= 0) continue;
        const balance = await manager
          .createQueryBuilder(StockBalanceEntity, 'sb')
          .setLock('pessimistic_write')
          .where('sb.organization_id = :organizationId', {
            organizationId: actor.organizationId,
          })
          .andWhere('sb.item_id = :itemId', { itemId: n.itemId })
          .andWhere('sb.location_id = :locationId', { locationId: n.locationId })
          .getOne();
        const onHand = balance ? Number(balance.quantity) : 0;
        if (onHand + n.delta < 0) {
          throw new BadRequestException(
            `Insufficient stock to edit: item ${n.itemId} at the location ` +
              `has ${onHand}, the edit needs ${-n.delta}.`,
          );
        }
      }

      const written = await this.ledgerService.recordBatchMovements(
        movements,
        manager,
      );

      await manager.delete(StockTransferLineEntity, { transferId: id });
      await manager.save(StockTransferLineEntity, buildLineEntities());
      await manager.update(StockTransferEntity, id, headerPatch);

      return written;
    });

    await this.ledgerService.publishMovementEvents(entries);
    this.logger.log(`Transfer ${id} edited (reverse + repost) by ${actor.userId}`);
    return this.findOrFail(id, actor.organizationId);
  }

  async post(
    id: string,
    actor: ActorContext,
    opts: { validateOnHand?: boolean } = {},
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(transfer.status, TransferStatus.POSTED);

    // Number was assigned on create(); reuse it (UNIQUE constraint forbids re-gen).
    const documentNumber = transfer.documentNumber;

    // Snapshot `purchase_price` per item once at posting time as the fallback
    // unit cost for lines that did not capture an explicit unit price, so both
    // legs (TRANSFER_OUT + TRANSFER_IN) carry the same value and net to zero.
    const itemIds = Array.from(new Set(transfer.lines.map((l) => l.itemId)));
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      transfer.organizationId,
      itemIds,
    );

    const buildMovements = (): RecordMovementParams[] => {
      const movements: RecordMovementParams[] = [];
      for (const line of transfer.lines) {
        const sourceLoc = line.sourceLocationId ?? transfer.sourceLocationId;
        const destLoc =
          line.destinationLocationId ?? transfer.destinationLocationId;
        if (!sourceLoc || !destLoc) {
          throw new BadRequestException(
            'Transfer line is missing a source or destination location',
          );
        }
        const unitCost =
          line.unitPrice != null
            ? Number(line.unitPrice)
            : itemCostByItemId.get(line.itemId) ?? 0;
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
      return movements;
    };

    const statusPatch = {
      status: TransferStatus.POSTED,
      postedBy: actor.userId,
      postedAt: new Date(),
      transferredAt: transfer.transferredAt ?? new Date(),
    };

    if (opts.validateOnHand) {
      // Branch-scoped (Kho → Kho) path: lock + validate on-hand at each source
      // location, then write both legs on the same transaction so concurrent
      // moves cannot oversell. Events publish only after the commit.
      const requiredByKey = new Map<
        string,
        { itemId: string; locationId: string; quantity: number }
      >();
      for (const line of transfer.lines) {
        const sourceLoc = line.sourceLocationId ?? transfer.sourceLocationId;
        if (!sourceLoc) {
          throw new BadRequestException(
            'Transfer line is missing a source location',
          );
        }
        const key = `${line.itemId}::${sourceLoc}`;
        const existing = requiredByKey.get(key);
        if (existing) {
          existing.quantity += Number(line.quantity);
        } else {
          requiredByKey.set(key, {
            itemId: line.itemId,
            locationId: sourceLoc,
            quantity: Number(line.quantity),
          });
        }
      }

      const entries = await this.dataSource.transaction(async (manager) => {
        for (const req of requiredByKey.values()) {
          const balance = await manager
            .createQueryBuilder(StockBalanceEntity, 'sb')
            .setLock('pessimistic_write')
            .where('sb.organization_id = :organizationId', {
              organizationId: actor.organizationId,
            })
            .andWhere('sb.item_id = :itemId', { itemId: req.itemId })
            .andWhere('sb.location_id = :locationId', {
              locationId: req.locationId,
            })
            .getOne();
          const onHand = balance ? Number(balance.quantity) : 0;
          if (req.quantity > onHand) {
            throw new BadRequestException(
              `Insufficient stock: item ${req.itemId} at the source location ` +
                `has ${onHand}, needs ${req.quantity}.`,
            );
          }
        }

        const written = await this.ledgerService.recordBatchMovements(
          buildMovements(),
          manager,
        );
        await manager.update(StockTransferEntity, id, statusPatch);
        return written;
      });

      await this.ledgerService.publishMovementEvents(entries);
    } else {
      // Legacy path (e.g. temp-warehouse consumer): recordBatchMovements opens
      // its own transaction and publishes its own events — behaviour unchanged.
      await this.dataSource.transaction(async (manager) => {
        await this.ledgerService.recordBatchMovements(buildMovements());
        await manager.update(StockTransferEntity, id, statusPatch);
      });
    }

    this.logger.log(`Transfer ${id} posted as ${documentNumber}`);
    return this.findOrFail(id, actor.organizationId);
  }

  /**
   * Void a transfer ("Xóa"). A DRAFT is voided directly (no ledger impact yet).
   * A POSTED transfer is corrected by a **reversing** ledger entry — stock
   * returns to the source location and leaves the destination — then the doc is
   * marked CANCELLED (the ledger stays immutable; corrections are reversals, not
   * deletes). Calling again on a CANCELLED doc throws (no double reversal).
   */
  async cancel(
    id: string,
    actor: ActorContext,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(transfer.status, TransferStatus.CANCELLED);

    // DRAFT: nothing posted yet — void directly.
    if (transfer.status === TransferStatus.DRAFT) {
      transfer.status = TransferStatus.CANCELLED;
      const saved = await this.transferRepo.save(transfer);
      this.logger.log(`Transfer ${id} voided (draft) by ${actor.userId}`);
      return saved;
    }

    // POSTED: reverse both legs, then mark CANCELLED — all in one transaction.
    const itemIds = Array.from(new Set(transfer.lines.map((l) => l.itemId)));
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      transfer.organizationId,
      itemIds,
    );

    const entries = await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];
      for (const line of transfer.lines) {
        const sourceLoc = line.sourceLocationId ?? transfer.sourceLocationId;
        const destLoc =
          line.destinationLocationId ?? transfer.destinationLocationId;
        if (!sourceLoc || !destLoc) {
          throw new BadRequestException(
            'Transfer line is missing a source or destination location',
          );
        }
        const unitCost =
          line.unitPrice != null
            ? Number(line.unitPrice)
            : itemCostByItemId.get(line.itemId) ?? 0;
        // Reverse the original move: stock returns to source, leaves dest.
        movements.push({
          itemId: line.itemId,
          locationId: sourceLoc,
          branchId: transfer.sourceBranchId,
          organizationId: transfer.organizationId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: line.quantity,
          referenceType: 'TRANSFER_REVERSAL',
          referenceId: transfer.id,
          notes: `Transfer reversal in: ${transfer.documentNumber}`,
          actorContext: actor,
          unitCost,
        });
        movements.push({
          itemId: line.itemId,
          locationId: destLoc,
          branchId: transfer.destinationBranchId,
          organizationId: transfer.organizationId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: -line.quantity,
          referenceType: 'TRANSFER_REVERSAL',
          referenceId: transfer.id,
          notes: `Transfer reversal out: ${transfer.documentNumber}`,
          actorContext: actor,
          unitCost,
        });
      }

      const written = await this.ledgerService.recordBatchMovements(
        movements,
        manager,
      );
      await manager.update(StockTransferEntity, id, {
        status: TransferStatus.CANCELLED,
      });
      return written;
    });

    await this.ledgerService.publishMovementEvents(entries);
    this.logger.log(`Transfer ${id} reversed + voided by ${actor.userId}`);
    return this.findOrFail(id, actor.organizationId);
  }

  async getById(
    id: string,
    organizationId: string,
  ): Promise<StockTransferEntity> {
    const transfer = await this.findOrFail(id, organizationId);
    await this.attachTransporters([transfer], organizationId);
    return transfer;
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

    await this.attachTransporters(data, query.organizationId);

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Inline the transporter user ({ id, fullName }) into each transfer row so the
   * FE renders the name without a second lookup. Batched to avoid N+1.
   */
  private async attachTransporters(
    transfers: StockTransferEntity[],
    organizationId: string,
  ): Promise<void> {
    const userIds = Array.from(
      new Set(
        transfers
          .map((t) => t.transporterUserId)
          .filter((id): id is string => !!id),
      ),
    );
    if (userIds.length === 0) {
      for (const t of transfers) t.transporter = null;
      return;
    }
    const users = await this.userRepo.find({
      where: userIds.map((id) => ({ id, organizationId })),
    });
    const byId = new Map(
      users.map((u) => [
        u.id,
        { id: u.id, fullName: `${u.firstName} ${u.lastName}`.trim() },
      ]),
    );
    for (const t of transfers) {
      t.transporter = t.transporterUserId
        ? byId.get(t.transporterUserId) ?? null
        : null;
    }
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
