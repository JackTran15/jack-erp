import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ILike,
  In,
  Not,
  Repository,
  QueryFailedError,
} from 'typeorm';
import { v5 as uuidv5 } from 'uuid';
import { createHash } from 'crypto';
import {
  DomainEventType,
  TempWarehouseCloseMode,
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
  TempWarehouseTransferKind,
  TempWarehouseTransferProcessingStatus,
  TempWarehouseTransferRequestedPayload,
  TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../../events/event-publisher.service';
import { StockTransferService } from '../transfer/stock-transfer.service';
import { TempWarehouseTransferMaterializerService } from './temp-warehouse-transfer-materializer.service';
import { TempWarehouseSessionEntity } from './temp-warehouse-session.entity';
import { TempWarehouseLineEntity } from './temp-warehouse-line.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';
import { UserEntity } from '../../auth/user.entity';
import { UserBranchAssignmentEntity } from '../../branch/user-branch-assignment.entity';
import { BranchLocationResolverService } from './branch-location-resolver.service';
import { StorageDefaultLocationResolverService } from '../location/storage-default-location-resolver.service';
import { AddTempWarehouseLineDto } from './dto/add-line.dto';
import { UpdateTempWarehouseLineDto } from './dto/update-line.dto';
import { ListTempWarehouseLinesQueryDto } from './dto/list-lines.query';
import { CloseBranchSessionsDto } from './dto/close-session.dto';
import { ListCarriersQueryDto } from './dto/list-carriers.query';
import { TransferTempWarehouseLinesDto } from './dto/transfer-lines.dto';

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface PublicItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  variantLabel: string | null;
}

export interface PublicLocation {
  id: string;
  code: string;
  name: string;
}

export type LineWithRelations = TempWarehouseLineEntity & {
  carrier: PublicUser | null;
  item: PublicItem | null;
  sourceLocation: PublicLocation | null;
  destinationLocation: PublicLocation | null;
};

export interface NettedLineView {
  itemId: string;
  item: PublicItem | null;
  totalW2s: number;
  totalS2w: number;
  netQuantity: number;
  netDirection: TempWarehouseDirection | null;
  lineIdsW2s: string[];
  lineIdsS2w: string[];
  carriers: PublicUser[];
}

type CarriersMap = Record<string, PublicUser>;
type ItemsMap = Record<string, PublicItem>;
type LocationsMap = Record<string, PublicLocation>;

export interface AddLineResult {
  session: TempWarehouseSessionEntity;
  line: TempWarehouseLineEntity;
}

export interface UpdateLineResult {
  oldLine: TempWarehouseLineEntity;
  newLine: TempWarehouseLineEntity;
}

export interface CloseBranchSessionsResult {
  sessions: TempWarehouseSessionEntity[];
  netOffsetEligible: boolean;
  autoBalancedLines?: TempWarehouseLineEntity[];
  publishedEvents?: { direction: TempWarehouseDirection; eventId: string }[];
}

const PG_UNIQUE_VIOLATION = '23505';

// Stable namespace UUID for deriving deterministic event IDs from (sessionId, direction).
// Any fixed v4 UUID works — must not change once events have been published in production.
const TEMP_WAREHOUSE_EVENT_NAMESPACE = '7b2f3c84-1d6e-4a9c-9b25-3f8a4e1c0d77';

// Business description (Vietnamese, user-facing) stamped on the stock transfer
// posted when a checkout consumes temp-warehouse stock. Data, not a log/error.
const fulfillTransferDescription = (invoiceNumber: string): string =>
  `Chuyển kho bán hàng hóa từ phiếu xuất đi tại kho tạm theo hóa đơn số ${invoiceNumber}`;

/** One ACTIVE warehouse_to_showroom line consumed (in full or in part) by a sale. */
interface ConsumedPortion {
  line: TempWarehouseLineEntity;
  take: number;
}

@Injectable()
export class TempWarehouseService {
  private readonly logger = new Logger(TempWarehouseService.name);

  constructor(
    @InjectRepository(TempWarehouseSessionEntity)
    private readonly sessionRepo: Repository<TempWarehouseSessionEntity>,
    @InjectRepository(TempWarehouseLineEntity)
    private readonly lineRepo: Repository<TempWarehouseLineEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserBranchAssignmentEntity)
    private readonly userBranchRepo: Repository<UserBranchAssignmentEntity>,
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly dataSource: DataSource,
    private readonly locationResolver: BranchLocationResolverService,
    private readonly storageDefaultLocationResolver: StorageDefaultLocationResolverService,
    private readonly eventPublisher: EventPublisher,
    private readonly stockTransferService: StockTransferService,
    private readonly transferMaterializer: TempWarehouseTransferMaterializerService,
  ) {}

  // ─── Session reads ──────────────────────────────────────────────────

  async getActiveSession(
    branchId: string,
    direction: TempWarehouseDirection,
    actor: ActorContext,
  ): Promise<TempWarehouseSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: {
        branchId,
        organizationId: actor.organizationId,
        status: TempWarehouseSessionStatus.ACTIVE,
        direction,
      },
    });
  }

  async getSessionById(
    id: string,
    actor: ActorContext,
  ): Promise<
    Omit<TempWarehouseSessionEntity, 'lines'> & { lines: LineWithRelations[] }
  > {
    const session = await this.sessionRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!session) {
      throw new NotFoundException({
        code: 'TEMP_WAREHOUSE_SESSION_NOT_FOUND',
        message: `Temp warehouse session ${id} not found`,
      });
    }
    // Hard-exclude TRANSFERRED — lines consumed by a partial transfer are no longer part of the working set.
    const rawLines = await this.lineRepo.find({
      where: {
        sessionId: id,
        organizationId: actor.organizationId,
        status: Not(TempWarehouseLineStatus.TRANSFERRED),
      },
      order: { createdAt: 'DESC' },
    });
    const lines = await this.attachLineRelations(
      rawLines,
      session,
      actor.organizationId,
    );
    return { ...session, lines };
  }

  // ─── Carrier list ──────────────────────────────────────────────────

  async listCarriersForBranch(
    query: ListCarriersQueryDto,
    actor: ActorContext,
  ): Promise<{
    data: PublicUser[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const assignments = await this.userBranchRepo.find({
      where: {
        branchId: query.branchId,
        organizationId: actor.organizationId,
      },
      select: ['userId'],
    });

    const userIds = assignments.map((a) => a.userId);
    if (userIds.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    const baseWhere = {
      id: In(userIds),
      organizationId: actor.organizationId,
      isActive: true,
    } as const;

    const search = query.search?.trim();
    const where = search
      ? [
          { ...baseWhere, firstName: ILike(`%${search}%`) },
          { ...baseWhere, lastName: ILike(`%${search}%`) },
          { ...baseWhere, email: ILike(`%${search}%`) },
        ]
      : baseWhere;

    const [users, total] = await this.userRepo.findAndCount({
      where,
      order: { firstName: 'ASC', lastName: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const data: PublicUser[] = users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
    }));

    return { data, total, page, pageSize };
  }

  // ─── Add line (auto-open session) ───────────────────────────────────

  async addLine(
    dto: AddTempWarehouseLineDto,
    actor: ActorContext,
  ): Promise<AddLineResult> {
    return this.dataSource.transaction(async (manager) => {
      let session = await manager.findOne(TempWarehouseSessionEntity, {
        where: {
          branchId: dto.branchId,
          organizationId: actor.organizationId,
          status: TempWarehouseSessionStatus.ACTIVE,
          direction: dto.direction,
        },
      });

      if (!session) {
        // Client may pin the session's warehouse/showroom storages explicitly
        // (each resolved to its default location); otherwise fall back to the
        // branch's main storage / main showroom locations.
        let warehouseLocationId: string;
        let showroomLocationId: string;
        if (dto.warehouseStorageId && dto.showroomStorageId) {
          warehouseLocationId =
            await this.storageDefaultLocationResolver.resolveStorageTransferLocation(
              dto.warehouseStorageId,
              actor.organizationId,
            );
          showroomLocationId =
            await this.storageDefaultLocationResolver.resolveStorageTransferLocation(
              dto.showroomStorageId,
              actor.organizationId,
            );
        } else {
          const resolved = await this.locationResolver.resolve(
            dto.branchId,
            actor.organizationId,
          );
          warehouseLocationId = resolved.warehouseLocationId;
          showroomLocationId = resolved.showroomLocationId;
        }

        // Guarantee distinct sides — a single-location branch (or same storage)
        // would otherwise open a session whose two locations are identical.
        if (warehouseLocationId === showroomLocationId) {
          throw new BadRequestException({
            code: 'TEMP_WAREHOUSE_SESSION_SAME_LOCATION',
            message:
              'Warehouse and showroom resolve to the same location; pick distinct storages or configure distinct default locations',
          });
        }

        const newSession = manager.create(TempWarehouseSessionEntity, {
          organizationId: actor.organizationId,
          branchId: dto.branchId,
          status: TempWarehouseSessionStatus.ACTIVE,
          direction: dto.direction,
          warehouseLocationId,
          showroomLocationId,
          openedBy: actor.userId,
          openedAt: new Date(),
          transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
          createdBy: actor.userId,
        });

        try {
          session = await manager.save(newSession);
        } catch (err) {
          if (this.isUniqueViolation(err)) {
            // Race: a concurrent request opened the session (branch, direction) first.
            session = await manager.findOne(TempWarehouseSessionEntity, {
              where: {
                branchId: dto.branchId,
                organizationId: actor.organizationId,
                status: TempWarehouseSessionStatus.ACTIVE,
                direction: dto.direction,
              },
            });
            if (!session) throw err;
          } else {
            throw err;
          }
        }
      }

      const line = manager.create(TempWarehouseLineEntity, {
        organizationId: actor.organizationId,
        branchId: dto.branchId,
        sessionId: session!.id,
        itemId: dto.itemId,
        direction: dto.direction,
        quantity: '1.00',
        carrierUserId: dto.carrierUserId,
        notes: dto.notes,
        sourceLocationId: dto.sourceLocationId,
        status: TempWarehouseLineStatus.ACTIVE,
        createdBy: actor.userId,
      });
      const savedLine = await manager.save(line);

      this.logger.log(
        `Added line ${savedLine.id} to session ${session!.id} (direction=${dto.direction})`,
      );

      return { session: session!, line: savedLine };
    });
  }

  // ─── Update line (soft-delete + new line) ───────────────────────────

  async updateLine(
    lineId: string,
    dto: UpdateTempWarehouseLineDto,
    actor: ActorContext,
  ): Promise<UpdateLineResult> {
    if (
      dto.itemId === undefined &&
      dto.carrierUserId === undefined &&
      dto.notes === undefined &&
      dto.sourceLocationId === undefined
    ) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_UPDATE_LINE_EMPTY_BODY',
        message: 'At least one field is required to update a line',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const oldLine = await manager.findOne(TempWarehouseLineEntity, {
        where: { id: lineId, organizationId: actor.organizationId },
      });
      if (!oldLine) {
        throw new NotFoundException({
          code: 'TEMP_WAREHOUSE_LINE_NOT_FOUND',
          message: `Line ${lineId} not found`,
        });
      }

      // Defensive idempotency: if line already superseded, return the existing pair.
      if (
        oldLine.status === TempWarehouseLineStatus.DELETED &&
        oldLine.supersededById
      ) {
        const existingNew = await manager.findOne(TempWarehouseLineEntity, {
          where: { id: oldLine.supersededById, organizationId: actor.organizationId },
        });
        if (existingNew) {
          this.logger.log(
            `updateLine ${lineId} replay-detected → returning existing supersede pair`,
          );
          return { oldLine, newLine: existingNew };
        }
      }

      if (oldLine.status !== TempWarehouseLineStatus.ACTIVE) {
        throw new BadRequestException({
          code: 'TEMP_WAREHOUSE_LINE_NOT_EDITABLE',
          message: `Cannot update a line with status=${oldLine.status}`,
        });
      }

      const session = await manager.findOne(TempWarehouseSessionEntity, {
        where: { id: oldLine.sessionId },
      });
      if (!session) {
        throw new NotFoundException({
          code: 'TEMP_WAREHOUSE_SESSION_NOT_FOUND',
          message: `Session ${oldLine.sessionId} not found`,
        });
      }
      if (session.status !== TempWarehouseSessionStatus.ACTIVE) {
        throw new BadRequestException({
          code: 'TEMP_WAREHOUSE_SESSION_CLOSED',
          message: 'Cannot update a line in a CLOSED session',
        });
      }

      const newLine = manager.create(TempWarehouseLineEntity, {
        organizationId: oldLine.organizationId,
        branchId: oldLine.branchId,
        sessionId: oldLine.sessionId,
        itemId: dto.itemId !== undefined ? dto.itemId : oldLine.itemId,
        // direction is intentionally immutable — changing the movement direction is a
        // semantically different transfer and should be done via DELETE + POST.
        direction: oldLine.direction,
        quantity: oldLine.quantity,
        carrierUserId:
          dto.carrierUserId !== undefined ? dto.carrierUserId : oldLine.carrierUserId,
        notes: dto.notes !== undefined ? dto.notes : oldLine.notes,
        sourceLocationId:
          dto.sourceLocationId !== undefined
            ? dto.sourceLocationId
            : oldLine.sourceLocationId,
        status: TempWarehouseLineStatus.ACTIVE,
        createdBy: actor.userId,
      });
      const savedNew = await manager.save(newLine);

      await manager.update(TempWarehouseLineEntity, oldLine.id, {
        status: TempWarehouseLineStatus.DELETED,
        supersededById: savedNew.id,
      });

      const refreshedOld = (await manager.findOne(TempWarehouseLineEntity, {
        where: { id: oldLine.id },
      }))!;

      return { oldLine: refreshedOld, newLine: savedNew };
    });
  }

  async deleteLine(
    lineId: string,
    actor: ActorContext,
  ): Promise<TempWarehouseLineEntity> {
    return this.dataSource.transaction(async (manager) => {
      const line = await manager.findOne(TempWarehouseLineEntity, {
        where: { id: lineId, organizationId: actor.organizationId },
      });
      if (!line) {
        throw new NotFoundException({
          code: 'TEMP_WAREHOUSE_LINE_NOT_FOUND',
          message: `Line ${lineId} not found`,
        });
      }

      // Idempotent: already DELETED → return as-is.
      if (line.status === TempWarehouseLineStatus.DELETED) {
        return line;
      }

      const session = await manager.findOne(TempWarehouseSessionEntity, {
        where: { id: line.sessionId },
      });
      if (!session || session.status !== TempWarehouseSessionStatus.ACTIVE) {
        throw new BadRequestException({
          code: 'TEMP_WAREHOUSE_SESSION_CLOSED',
          message: 'Cannot delete a line in a CLOSED session',
        });
      }

      await manager.update(TempWarehouseLineEntity, line.id, {
        status: TempWarehouseLineStatus.DELETED,
      });

      return (await manager.findOne(TempWarehouseLineEntity, {
        where: { id: line.id },
      }))!;
    });
  }

  // ─── List lines ─────────────────────────────────────────────────────

  async listLines(
    query: ListTempWarehouseLinesQueryDto,
    actor: ActorContext,
  ): Promise<
    | {
        sessionId: string | null;
        data: LineWithRelations[];
        total: number;
        page: number;
        pageSize: number;
      }
    | { sessionId: string | null; items: NettedLineView[] }
  > {
    if (query.hideBalanced && !query.hideOffsetting) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_HIDE_BALANCED_REQUIRES_NETTED',
        message: 'hideBalanced=true requires hideOffsetting=true',
      });
    }

    // Netted (aggregated) view — may span both ACTIVE direction sessions of a branch.
    if (query.hideOffsetting) {
      const sessionIds = await this.resolveNettedSessionIds(query, actor);
      if (sessionIds.length === 0) {
        return { sessionId: null, items: [] };
      }
      const items = await this.computeNettedView(
        sessionIds,
        actor.organizationId,
        !!query.hideBalanced,
      );
      return { sessionId: sessionIds[0], items };
    }

    // Raw view — resolved to a single (branch, direction) session.
    const sessionId = await this.resolveSessionId(query, actor);
    if (!sessionId) {
      return {
        sessionId: null,
        data: [],
        total: 0,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 50,
      };
    }

    const statusFilter =
      !query.status || query.status === 'ALL'
        ? undefined
        : (query.status as TempWarehouseLineStatus);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const qb = this.lineRepo
      .createQueryBuilder('l')
      .where('l.session_id = :sessionId', { sessionId })
      .andWhere('l.organization_id = :orgId', {
        orgId: actor.organizationId,
      });

    if (query.includeTransferred) {
      // ACTIVE working set + TRANSFERRED-by-sale rows (those tied to an invoice).
      // Manual transfers (TRANSFERRED without an invoiceId) stay excluded so the
      // Chuyển kho tạm screen is not polluted. The status filter is ignored here.
      qb.andWhere(
        '(l.status = :active OR (l.status = :transferred AND l.invoice_id IS NOT NULL))',
        {
          active: TempWarehouseLineStatus.ACTIVE,
          transferred: TempWarehouseLineStatus.TRANSFERRED,
        },
      );
    } else {
      // Hard-exclude TRANSFERRED from every raw-mode listing, including status=ALL.
      qb.andWhere('l.status != :transferred', {
        transferred: TempWarehouseLineStatus.TRANSFERRED,
      });
      if (statusFilter) {
        qb.andWhere('l.status = :status', { status: statusFilter });
      } else if (!query.status) {
        qb.andWhere('l.status = :active', {
          active: TempWarehouseLineStatus.ACTIVE,
        });
      }
    }
    if (query.direction) {
      qb.andWhere('l.direction = :direction', { direction: query.direction });
    }

    const [rawLines, total] = await qb
      .orderBy('l.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, organizationId: actor.organizationId },
    });
    const data = await this.attachLineRelations(
      rawLines,
      session,
      actor.organizationId,
    );

    return { sessionId, data, total, page, pageSize };
  }

  private async resolveSessionId(
    query: ListTempWarehouseLinesQueryDto,
    actor: ActorContext,
  ): Promise<string | null> {
    if (query.sessionId) {
      const s = await this.sessionRepo.findOne({
        where: { id: query.sessionId, organizationId: actor.organizationId },
      });
      return s?.id ?? null;
    }
    if (query.branchId) {
      if (!query.direction) {
        throw new BadRequestException({
          code: 'TEMP_WAREHOUSE_LIST_MISSING_DIRECTION',
          message:
            'direction is required when listing raw lines by branchId (a branch holds one session per direction)',
        });
      }
      const s = await this.getActiveSession(
        query.branchId,
        query.direction,
        actor,
      );
      return s?.id ?? null;
    }
    throw new BadRequestException({
      code: 'TEMP_WAREHOUSE_LIST_MISSING_SCOPE',
      message: 'Either branchId or sessionId must be provided',
    });
  }

  // Netted view can aggregate across both ACTIVE direction sessions of a branch
  // (or a single one when direction is given / sessionId is pinned).
  private async resolveNettedSessionIds(
    query: ListTempWarehouseLinesQueryDto,
    actor: ActorContext,
  ): Promise<string[]> {
    if (query.sessionId) {
      const s = await this.sessionRepo.findOne({
        where: { id: query.sessionId, organizationId: actor.organizationId },
      });
      return s ? [s.id] : [];
    }
    if (query.branchId) {
      const sessions = await this.sessionRepo.find({
        where: {
          branchId: query.branchId,
          organizationId: actor.organizationId,
          status: TempWarehouseSessionStatus.ACTIVE,
          ...(query.direction ? { direction: query.direction } : {}),
        },
      });
      return sessions.map((s) => s.id);
    }
    throw new BadRequestException({
      code: 'TEMP_WAREHOUSE_LIST_MISSING_SCOPE',
      message: 'Either branchId or sessionId must be provided',
    });
  }

  private async computeNettedView(
    sessionIds: string[],
    organizationId: string,
    hideBalanced: boolean,
  ): Promise<NettedLineView[]> {
    const lines = await this.lineRepo.find({
      where: {
        sessionId: In(sessionIds),
        organizationId,
        status: In([
          TempWarehouseLineStatus.ACTIVE,
          TempWarehouseLineStatus.AUTO_BALANCED,
        ]),
      },
      select: ['id', 'itemId', 'direction', 'quantity', 'carrierUserId'],
    });

    interface Bucket {
      totalW2s: number;
      totalS2w: number;
      lineIdsW2s: string[];
      lineIdsS2w: string[];
      carriers: Set<string>;
    }
    const byItem = new Map<string, Bucket>();

    for (const line of lines) {
      let bucket = byItem.get(line.itemId);
      if (!bucket) {
        bucket = {
          totalW2s: 0,
          totalS2w: 0,
          lineIdsW2s: [],
          lineIdsS2w: [],
          carriers: new Set<string>(),
        };
        byItem.set(line.itemId, bucket);
      }
      const qty = Number(line.quantity);
      if (line.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) {
        bucket.totalW2s += qty;
        bucket.lineIdsW2s.push(line.id);
      } else {
        bucket.totalS2w += qty;
        bucket.lineIdsS2w.push(line.id);
      }
      if (line.carrierUserId) bucket.carriers.add(line.carrierUserId);
    }

    const allCarrierIds = new Set<string>();
    for (const b of byItem.values()) {
      for (const id of b.carriers) allCarrierIds.add(id);
    }
    const carriersMap = await this.loadCarriers(
      [...allCarrierIds],
      organizationId,
    );
    const itemsMap = await this.loadItems([...byItem.keys()], organizationId);

    const result: NettedLineView[] = [];
    for (const [itemId, b] of byItem.entries()) {
      if (hideBalanced && b.totalW2s === b.totalS2w) continue;
      const diff = b.totalW2s - b.totalS2w;
      let netDirection: TempWarehouseDirection | null = null;
      if (diff > 0) netDirection = TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
      else if (diff < 0) netDirection = TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE;
      const carrierIdsSorted = [...b.carriers].sort();
      const carriers = carrierIdsSorted
        .map((id) => carriersMap[id])
        .filter((u): u is PublicUser => !!u);
      result.push({
        itemId,
        item: itemsMap[itemId] ?? null,
        totalW2s: b.totalW2s,
        totalS2w: b.totalS2w,
        netQuantity: Math.abs(diff),
        netDirection,
        lineIdsW2s: b.lineIdsW2s,
        lineIdsS2w: b.lineIdsS2w,
        carriers,
      });
    }
    result.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
    return result;
  }

  private async attachLineRelations(
    lines: TempWarehouseLineEntity[],
    session: TempWarehouseSessionEntity | null,
    organizationId: string,
  ): Promise<LineWithRelations[]> {
    if (lines.length === 0) return [];

    const carrierIds = this.collectCarrierIds(lines);
    const itemIds = Array.from(new Set(lines.map((l) => l.itemId)));
    const locationIds = session
      ? [session.warehouseLocationId, session.showroomLocationId]
      : [];

    const [carriersMap, itemsMap, locationsMap] = await Promise.all([
      this.loadCarriers(carrierIds, organizationId),
      this.loadItems(itemIds, organizationId),
      this.loadLocations(locationIds, organizationId),
    ]);

    const wLoc = session ? locationsMap[session.warehouseLocationId] ?? null : null;
    const sLoc = session ? locationsMap[session.showroomLocationId] ?? null : null;

    return lines.map((l) => {
      const isW2s = l.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
      return {
        ...l,
        carrier: l.carrierUserId ? carriersMap[l.carrierUserId] ?? null : null,
        item: itemsMap[l.itemId] ?? null,
        sourceLocation: isW2s ? wLoc : sLoc,
        destinationLocation: isW2s ? sLoc : wLoc,
      };
    });
  }

  private collectCarrierIds(lines: TempWarehouseLineEntity[]): string[] {
    const set = new Set<string>();
    for (const l of lines) {
      if (l.carrierUserId) set.add(l.carrierUserId);
    }
    return [...set];
  }

  private async loadCarriers(
    userIds: string[],
    organizationId: string,
  ): Promise<CarriersMap> {
    if (userIds.length === 0) return {};
    const users = await this.userRepo.find({
      where: { id: In(userIds), organizationId },
      select: ['id', 'firstName', 'lastName', 'email'],
    });
    const map: CarriersMap = {};
    for (const u of users) {
      map[u.id] = {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
      };
    }
    return map;
  }

  private async loadItems(
    itemIds: string[],
    organizationId: string,
  ): Promise<ItemsMap> {
    if (itemIds.length === 0) return {};
    const items = await this.itemRepo.find({
      where: { id: In(itemIds), organizationId },
      select: ['id', 'code', 'name', 'unit', 'variantLabel'],
    });
    const map: ItemsMap = {};
    for (const i of items) {
      map[i.id] = {
        id: i.id,
        code: i.code,
        name: i.name,
        unit: i.unit,
        variantLabel: i.variantLabel ?? null,
      };
    }
    return map;
  }

  private async loadLocations(
    locationIds: string[],
    organizationId: string,
  ): Promise<LocationsMap> {
    const unique = Array.from(new Set(locationIds.filter(Boolean)));
    if (unique.length === 0) return {};
    const locations = await this.locationRepo.find({
      where: { id: In(unique), organizationId },
      select: ['id', 'code', 'name'],
    });
    const map: LocationsMap = {};
    for (const l of locations) {
      map[l.id] = { id: l.id, code: l.code, name: l.name };
    }
    return map;
  }

  // ─── Close session ──────────────────────────────────────────────────

  /**
   * Close both direction sessions of a branch at once. NET_OFFSET (đối cộng trừ)
   * only applies when BOTH a w2s and an s2w session are ACTIVE and share the same
   * warehouse + showroom locations; otherwise it is rejected and the caller must
   * pick CREATE_TRANSFERS (single transfer per session) or NONE.
   */
  async closeBranchSessions(
    dto: CloseBranchSessionsDto,
    actor: ActorContext,
  ): Promise<CloseBranchSessionsResult> {
    type PublishItem = {
      direction: TempWarehouseDirection;
      payload: TempWarehouseTransferRequestedPayload;
    };
    const publishPlan: PublishItem[] = [];
    let replay: CloseBranchSessionsResult | null = null;

    const txResult = await this.dataSource.transaction(async (manager) => {
      const sessions = await manager.find(TempWarehouseSessionEntity, {
        where: {
          branchId: dto.branchId,
          organizationId: actor.organizationId,
        },
        order: { openedAt: 'ASC' },
      });

      const active = sessions.filter(
        (s) => s.status === TempWarehouseSessionStatus.ACTIVE,
      );
      const w2s =
        active.find(
          (s) => s.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        ) ?? null;
      const s2w =
        active.find(
          (s) => s.direction === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
        ) ?? null;

      const eligible =
        !!w2s &&
        !!s2w &&
        w2s.warehouseLocationId === s2w.warehouseLocationId &&
        w2s.showroomLocationId === s2w.showroomLocationId;

      // Nothing ACTIVE to close — distinguish idempotent replay from not-found.
      if (!w2s && !s2w) {
        const closed = sessions
          .filter((s) => s.status === TempWarehouseSessionStatus.CLOSED && s.closedAt)
          .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime());
        if (closed.length === 0) {
          throw new NotFoundException({
            code: 'TEMP_WAREHOUSE_NO_ACTIVE_SESSION',
            message: `Branch ${dto.branchId} has no ACTIVE temp warehouse session to close`,
          });
        }
        // Latest closed session per direction is the just-closed set we replay.
        const latestByDir = new Map<string, TempWarehouseSessionEntity>();
        for (const s of closed) {
          const key = s.direction ?? 'legacy';
          if (!latestByDir.has(key)) latestByDir.set(key, s);
        }
        const latest = [...latestByDir.values()];
        const conflicting = latest.find((s) => s.closeMode !== dto.mode);
        if (conflicting) {
          throw new ConflictException({
            code: 'TEMP_WAREHOUSE_SESSION_ALREADY_CLOSED_DIFFERENT_MODE',
            message: `Branch ${dto.branchId} sessions already CLOSED with a different mode; cannot re-close with mode=${dto.mode}`,
          });
        }
        this.logger.log(
          `closeBranchSessions ${dto.branchId} replay-detected (mode=${dto.mode}) → returning current state`,
        );
        replay = { sessions: latest, netOffsetEligible: false };
        return null;
      }

      if (dto.mode === TempWarehouseCloseMode.NET_OFFSET && !eligible) {
        throw new BadRequestException({
          code: 'TEMP_WAREHOUSE_NET_OFFSET_NOT_ELIGIBLE',
          message:
            'NET_OFFSET requires two ACTIVE sessions (w2s + s2w) sharing the same warehouse and showroom locations',
        });
      }

      const presentSessions = [w2s, s2w].filter(
        (s): s is TempWarehouseSessionEntity => !!s,
      );
      const linesBySession = new Map<string, TempWarehouseLineEntity[]>();
      for (const s of presentSessions) {
        linesBySession.set(
          s.id,
          await manager.find(TempWarehouseLineEntity, {
            where: { sessionId: s.id, status: TempWarehouseLineStatus.ACTIVE },
            order: { createdAt: 'ASC' },
          }),
        );
      }

      const basePatch: Partial<TempWarehouseSessionEntity> = {
        status: TempWarehouseSessionStatus.CLOSED,
        closeMode: dto.mode,
        closedBy: actor.userId,
        closedAt: new Date(),
      };
      let autoBalancedLines: TempWarehouseLineEntity[] | undefined;

      if (dto.mode === TempWarehouseCloseMode.NET_OFFSET) {
        const combinedLines = presentSessions.flatMap(
          (s) => linesBySession.get(s.id) ?? [],
        );
        autoBalancedLines = await this.buildAutoBalancedLines(
          manager,
          { w2s: w2s!, s2w: s2w! },
          combinedLines,
          actor,
        );
        for (const s of presentSessions) {
          await manager.update(TempWarehouseSessionEntity, s.id, {
            ...basePatch,
            transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
          });
        }
      } else if (dto.mode === TempWarehouseCloseMode.CREATE_TRANSFERS) {
        for (const s of presentSessions) {
          const lines = linesBySession.get(s.id) ?? [];
          await manager.update(TempWarehouseSessionEntity, s.id, {
            ...basePatch,
            transferProcessingStatus:
              lines.length > 0
                ? TempWarehouseTransferProcessingStatus.PENDING
                : TempWarehouseTransferProcessingStatus.NONE,
          });
          if (lines.length > 0) {
            publishPlan.push({
              direction: s.direction!,
              payload: this.buildEventPayload(s, s.direction!, lines, actor),
            });
          }
        }
      } else {
        // NONE
        for (const s of presentSessions) {
          await manager.update(TempWarehouseSessionEntity, s.id, {
            ...basePatch,
            transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
          });
        }
      }

      const refreshed = await manager.find(TempWarehouseSessionEntity, {
        where: { id: In(presentSessions.map((s) => s.id)) },
      });

      return { sessions: refreshed, netOffsetEligible: eligible, autoBalancedLines };
    });

    if (replay) return replay;

    // Publish events AFTER commit.
    const publishedEvents: { direction: TempWarehouseDirection; eventId: string }[] = [];
    for (const { direction, payload } of publishPlan) {
      const eventId = uuidv5(
        `${payload.sessionId}:${direction}`,
        TEMP_WAREHOUSE_EVENT_NAMESPACE,
      );
      try {
        await this.eventPublisher.publish(
          ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED,
          {
            eventId,
            eventType: DomainEventType.TEMP_WAREHOUSE_TRANSFER_REQUESTED,
            timestamp: new Date().toISOString(),
            organizationId: payload.organizationId,
            branchId: payload.branchId,
            correlationId: payload.sessionId,
            payload,
          },
          `${payload.sessionId}:${direction}`,
        );
        publishedEvents.push({ direction, eventId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to publish transfer-requested event for ${payload.sessionId}:${direction}: ${msg}`,
          err instanceof Error ? err.stack : undefined,
        );
        await this.sessionRepo.update(payload.sessionId, {
          transferProcessingStatus: TempWarehouseTransferProcessingStatus.FAILED,
          transferFailureReason: `Failed to publish event: ${msg}`,
        });
      }
    }

    return {
      sessions: txResult!.sessions,
      netOffsetEligible: txResult!.netOffsetEligible,
      autoBalancedLines: txResult!.autoBalancedLines,
      publishedEvents,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private buildEventPayload(
    session: TempWarehouseSessionEntity,
    direction: TempWarehouseDirection,
    lines: TempWarehouseLineEntity[],
    actor: ActorContext,
    extra?: { kind?: TempWarehouseTransferKind; notes?: string },
  ): TempWarehouseTransferRequestedPayload {
    const isW2s = direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
    return {
      sessionId: session.id,
      organizationId: session.organizationId,
      branchId: session.branchId!,
      direction,
      sourceLocationId: isW2s
        ? session.warehouseLocationId
        : session.showroomLocationId,
      destinationLocationId: isW2s
        ? session.showroomLocationId
        : session.warehouseLocationId,
      sourceBranchId: session.branchId!,
      destinationBranchId: session.branchId!,
      lines: lines.map((l) => ({
        tempWarehouseLineId: l.id,
        itemId: l.itemId,
        quantity: Number(l.quantity),
        sourceLocationId: l.sourceLocationId ?? undefined,
      })),
      actor: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        roles: actor.roles,
      },
      requestedAt: new Date().toISOString(),
      ...(extra?.kind ? { kind: extra.kind } : {}),
      ...(extra?.notes ? { notes: extra.notes } : {}),
    };
  }

  private async buildAutoBalancedLines(
    manager: ReturnType<DataSource['createEntityManager']>,
    sessions: {
      w2s: TempWarehouseSessionEntity;
      s2w: TempWarehouseSessionEntity;
    },
    activeLines: TempWarehouseLineEntity[],
    actor: ActorContext,
  ): Promise<TempWarehouseLineEntity[]> {
    // Defensive idempotency: if AUTO_BALANCED lines already exist on either
    // session, return them and skip insert.
    const existing = await manager.find(TempWarehouseLineEntity, {
      where: {
        sessionId: In([sessions.w2s.id, sessions.s2w.id]),
        status: TempWarehouseLineStatus.AUTO_BALANCED,
      },
    });
    if (existing.length > 0) {
      return existing;
    }

    const byItem = new Map<string, { w2s: number; s2w: number }>();
    for (const l of activeLines) {
      const entry = byItem.get(l.itemId) ?? { w2s: 0, s2w: 0 };
      const q = Number(l.quantity);
      if (l.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) {
        entry.w2s += q;
      } else {
        entry.s2w += q;
      }
      byItem.set(l.itemId, entry);
    }

    const created: TempWarehouseLineEntity[] = [];
    for (const [itemId, { w2s, s2w }] of byItem.entries()) {
      const diff = w2s - s2w;
      if (diff === 0) continue;
      // The compensating line carries the opposite direction of the net surplus
      // and is attached to the session that owns that direction.
      const compensateDirection =
        diff > 0
          ? TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE
          : TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
      const owner =
        compensateDirection === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE
          ? sessions.s2w
          : sessions.w2s;
      const compensate = manager.create(TempWarehouseLineEntity, {
        organizationId: owner.organizationId,
        branchId: owner.branchId,
        sessionId: owner.id,
        itemId,
        direction: compensateDirection,
        quantity: Math.abs(diff).toFixed(2),
        status: TempWarehouseLineStatus.AUTO_BALANCED,
        notes: 'Auto-balanced on close (NET_OFFSET)',
        createdBy: actor.userId,
      });
      created.push(await manager.save(compensate));
    }
    return created;
  }

  private isUniqueViolation(err: unknown): boolean {
    if (err instanceof QueryFailedError) {
      const driverErr = (err as QueryFailedError & { driverError?: { code?: string } }).driverError;
      return driverErr?.code === PG_UNIQUE_VIOLATION;
    }
    return false;
  }

  // Record a direction's transfer id and mark the session COMPLETED once every
  // direction that actually has lines has a transfer id. A single-direction session
  // therefore completes after its one transfer. Called by the consumer.
  async markTransferCompleted(
    sessionId: string,
    direction: TempWarehouseDirection,
    transferId: string,
  ): Promise<void> {
    const patch: Partial<TempWarehouseSessionEntity> =
      direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
        ? { transferW2sId: transferId }
        : { transferS2wId: transferId };
    await this.sessionRepo.update(sessionId, patch);

    const refreshed = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!refreshed) return;
    // Completion check: status moves to COMPLETED once every direction with lines has a transfer id.
    const linesByDir = await this.lineRepo
      .createQueryBuilder('l')
      .select('DISTINCT l.direction', 'direction')
      .where('l.session_id = :sid', { sid: sessionId })
      .andWhere('l.status IN (:...statuses)', {
        statuses: [TempWarehouseLineStatus.ACTIVE, TempWarehouseLineStatus.AUTO_BALANCED],
      })
      .getRawMany<{ direction: TempWarehouseDirection }>();

    const directions = new Set(linesByDir.map((r) => r.direction));
    const w2sDone =
      !directions.has(TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) ||
      !!refreshed.transferW2sId;
    const s2wDone =
      !directions.has(TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE) ||
      !!refreshed.transferS2wId;

    if (w2sDone && s2wDone) {
      await this.sessionRepo.update(sessionId, {
        transferProcessingStatus: TempWarehouseTransferProcessingStatus.COMPLETED,
      });
    }
  }

  async markTransferFailed(
    sessionId: string,
    reason: string,
  ): Promise<void> {
    await this.sessionRepo.update(sessionId, {
      transferProcessingStatus: TempWarehouseTransferProcessingStatus.FAILED,
      transferFailureReason: reason,
    });
  }

  /** Lookup helper for the consumer's defensive idempotency check. */
  async findSessionForConsumer(
    sessionId: string,
    organizationId: string,
  ): Promise<TempWarehouseSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: { id: sessionId, organizationId },
    });
  }

  // ─── Checkout fulfillment ───────────────────────────────────────────

  /**
   * Consume temp-warehouse stock for a posted invoice. For each sold item, match
   * ACTIVE warehouse_to_showroom lines FIFO (createdAt ASC), consume
   * min(saleQty, Σ staged qty), and post a single warehouse -> showroom transfer
   * (one line per item) tied to the invoice. The consumed portion of each line
   * flips to TRANSFERRED (with invoiceId/invoiceNumber/transferId); a partially
   * consumed line keeps its remainder as a fresh ACTIVE line (supersededById
   * chain), mirroring the edit/split pattern.
   *
   * No-ops when the branch has no ACTIVE session or no staged line matches.
   * Idempotent: processed_events dedupes on eventId=invoiceId, and a defensive
   * guard skips when any line already carries this invoiceId.
   */
  async fulfillInvoiceFromTempWarehouse(
    p: TempWarehouseInvoiceFulfillRequestedPayload,
    actor: ActorContext,
  ): Promise<void> {
    // Checkout fulfillment only consumes warehouse_to_showroom staged stock,
    // so it targets the branch's w2s session.
    const session = await this.getActiveSession(
      p.branchId,
      TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
      actor,
    );
    if (!session) return;

    // Defensive idempotency: this invoice already consumed staged stock.
    const alreadyFulfilled = await this.lineRepo.findOne({
      where: { invoiceId: p.invoiceId, organizationId: p.organizationId },
      select: { id: true },
    });
    if (alreadyFulfilled) {
      this.logger.log(
        `fulfillInvoice ${p.invoiceId} replay-detected → lines already carry this invoice, skipping`,
      );
      return;
    }

    // Build the consume plan (reads only). One transfer line per item; multiple
    // FIFO temp lines for the same item aggregate into that item's quantity.
    const plan: ConsumedPortion[] = [];
    const consumedByItem = new Map<
      string,
      { quantity: number; sourceLocationId?: string | null }
    >();
    for (const reqLine of p.lines) {
      const activeLines = await this.lineRepo.find({
        where: {
          sessionId: session.id,
          organizationId: p.organizationId,
          itemId: reqLine.itemId,
          direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
          status: TempWarehouseLineStatus.ACTIVE,
        },
        order: { createdAt: 'ASC' },
      });

      let need = reqLine.quantity;
      for (const line of activeLines) {
        if (need <= 0) break;
        const take = Math.min(need, Number(line.quantity));
        if (take <= 0) continue;
        plan.push({ line, take });
        const agg = consumedByItem.get(reqLine.itemId);
        if (agg) {
          agg.quantity += take;
        } else {
          consumedByItem.set(reqLine.itemId, {
            quantity: take,
            sourceLocationId: line.sourceLocationId,
          });
        }
        need -= take;
      }
    }

    if (plan.length === 0) return;

    // Reuse the materializer (source shelf + showroom shelf resolution) by feeding
    // it a warehouse_to_showroom transfer request built from the consumed totals.
    const description = fulfillTransferDescription(p.invoiceNumber);
    const transferPayload: TempWarehouseTransferRequestedPayload = {
      sessionId: session.id,
      organizationId: p.organizationId,
      branchId: p.branchId,
      direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
      sourceLocationId: session.warehouseLocationId,
      destinationLocationId: session.showroomLocationId,
      sourceBranchId: p.branchId,
      destinationBranchId: p.branchId,
      lines: [...consumedByItem.entries()].map(([itemId, agg]) => ({
        tempWarehouseLineId: itemId,
        itemId,
        quantity: agg.quantity,
        sourceLocationId: agg.sourceLocationId ?? undefined,
      })),
      actor: {
        userId: actor.userId,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        roles: actor.roles,
      },
      requestedAt: new Date().toISOString(),
      kind: TempWarehouseTransferKind.PARTIAL,
      notes: description,
    };

    const input = await this.transferMaterializer.buildBranchScopedTransfer(
      transferPayload,
      actor,
    );
    input.notes = description;
    input.invoiceId = p.invoiceId;
    input.invoiceNumber = p.invoiceNumber;

    const transfer = await this.stockTransferService.createAndPost(
      input,
      actor,
      { validateOnHand: false },
    );

    // Split + mark consumed lines TRANSFERRED in one transaction. The transfer is
    // already POSTED; re-check each line is still ACTIVE before mutating it.
    await this.dataSource.transaction(async (manager) => {
      for (const { line, take } of plan) {
        const fresh = await manager.findOne(TempWarehouseLineEntity, {
          where: {
            id: line.id,
            organizationId: p.organizationId,
            status: TempWarehouseLineStatus.ACTIVE,
          },
        });
        if (!fresh) continue;

        const lineQty = Number(fresh.quantity);
        const patch: Partial<TempWarehouseLineEntity> = {
          status: TempWarehouseLineStatus.TRANSFERRED,
          quantity: take.toFixed(2),
          transferId: transfer.id,
          invoiceId: p.invoiceId,
          invoiceNumber: p.invoiceNumber,
        };

        if (take < lineQty) {
          const remainder = manager.create(TempWarehouseLineEntity, {
            organizationId: fresh.organizationId,
            branchId: fresh.branchId,
            sessionId: fresh.sessionId,
            itemId: fresh.itemId,
            direction: fresh.direction,
            quantity: (lineQty - take).toFixed(2),
            carrierUserId: fresh.carrierUserId,
            notes: fresh.notes,
            sourceLocationId: fresh.sourceLocationId,
            status: TempWarehouseLineStatus.ACTIVE,
            createdBy: actor.userId,
          });
          const savedRemainder = await manager.save(remainder);
          patch.supersededById = savedRemainder.id;
        }

        await manager.update(TempWarehouseLineEntity, fresh.id, patch);
      }
    });

    this.logger.log(
      `Invoice ${p.invoiceId} fulfilled from temp warehouse: transfer ${transfer.id}, ${plan.length} line(s) consumed`,
    );
  }

  // ─── Partial transfer ──────────────────────────────────────────────

  async transferLines(
    sessionId: string,
    dto: TransferTempWarehouseLinesDto,
    actor: ActorContext,
  ): Promise<{
    session: TempWarehouseSessionEntity;
    publishedEvents: {
      direction: TempWarehouseDirection;
      eventId: string;
      lineIds: string[];
    }[];
  }> {
    type PublishItem = {
      direction: TempWarehouseDirection;
      lineIds: string[];
      payload: TempWarehouseTransferRequestedPayload;
    };

    const { session, publishPlan } = await this.dataSource.transaction(
      async (manager) => {
        const found = await manager.findOne(TempWarehouseSessionEntity, {
          where: { id: sessionId, organizationId: actor.organizationId },
        });
        if (!found) {
          throw new NotFoundException({
            code: 'TEMP_WAREHOUSE_SESSION_NOT_FOUND',
            message: `Session ${sessionId} not found`,
          });
        }
        if (found.status !== TempWarehouseSessionStatus.ACTIVE) {
          throw new ConflictException({
            code: 'TEMP_WAREHOUSE_SESSION_CLOSED',
            message: `Session ${sessionId} is not ACTIVE (current=${found.status}); partial transfer is only allowed on ACTIVE sessions`,
          });
        }

        // Canonicalize input — sort + dedupe so retries with reordered or duplicated IDs collide on the same eventId.
        const uniqueLineIds = [...new Set(dto.lineIds)].sort();

        const loaded = await manager.find(TempWarehouseLineEntity, {
          where: {
            id: In(uniqueLineIds),
            sessionId,
            organizationId: actor.organizationId,
          },
        });

        const loadedById = new Map(loaded.map((l) => [l.id, l]));
        const missing = uniqueLineIds.filter((id) => !loadedById.has(id));
        if (missing.length > 0) {
          throw new BadRequestException({
            code: 'TEMP_WAREHOUSE_LINES_NOT_FOUND_IN_SESSION',
            message: `Lines not found in session ${sessionId}: ${missing.join(', ')}`,
            missingLineIds: missing,
          });
        }

        // Resolve each requested line to its current ACTIVE version. Editing a
        // line soft-deletes it and creates a successor (supersededById), possibly
        // across several edits — so a selection captured before an edit carries a
        // now-DELETED id. Follow the chain to the latest ACTIVE line; skip lines
        // with no ACTIVE descendant (truly deleted / already transferred). This
        // keeps "Xử lý chuyển kho" working when the selection includes edited rows.
        const resolvedById = new Map<string, TempWarehouseLineEntity>();
        const skippedLineIds: string[] = [];
        for (const id of uniqueLineIds) {
          const active = await this.resolveActiveLine(
            manager,
            loadedById.get(id)!,
            sessionId,
            actor.organizationId,
          );
          if (active) resolvedById.set(active.id, active);
          else skippedLineIds.push(id);
        }

        const resolved = [...resolvedById.values()];
        if (resolved.length === 0) {
          throw new BadRequestException({
            code: 'TEMP_WAREHOUSE_NO_TRANSFERABLE_LINES',
            message: `No transferable (ACTIVE) lines in session ${sessionId} — all selected lines were deleted or already transferred`,
            skippedLineIds,
          });
        }
        if (skippedLineIds.length > 0) {
          this.logger.warn(
            `transferLines session=${sessionId}: skipped ${skippedLineIds.length} non-resolvable line(s): ${skippedLineIds.join(', ')}`,
          );
        }

        const w2sLines = resolved.filter(
          (l) => l.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        );
        const s2wLines = resolved.filter(
          (l) => l.direction === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
        );

        const plan: PublishItem[] = [];
        if (w2sLines.length > 0) {
          plan.push({
            direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
            lineIds: w2sLines.map((l) => l.id),
            payload: this.buildEventPayload(
              found,
              TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
              w2sLines,
              actor,
              { kind: TempWarehouseTransferKind.PARTIAL, notes: dto.notes },
            ),
          });
        }
        if (s2wLines.length > 0) {
          plan.push({
            direction: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
            lineIds: s2wLines.map((l) => l.id),
            payload: this.buildEventPayload(
              found,
              TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
              s2wLines,
              actor,
              { kind: TempWarehouseTransferKind.PARTIAL, notes: dto.notes },
            ),
          });
        }

        return { session: found, publishPlan: plan };
      },
    );

    // Publish after commit. Deterministic eventId keyed on sorted lineIds so:
    //   - Same body (same subset) → same eventId → consumer dedupes via processed_events.
    //   - Different subset → different eventId → independent transfer.
    const publishedEvents: {
      direction: TempWarehouseDirection;
      eventId: string;
      lineIds: string[];
    }[] = [];
    for (const item of publishPlan) {
      const sortedIds = [...item.lineIds].sort();
      const hash = createHash('sha256')
        .update(sortedIds.join(','))
        .digest('hex')
        .slice(0, 32);
      const eventId = uuidv5(
        `${session.id}:${item.direction}:partial:${hash}`,
        TEMP_WAREHOUSE_EVENT_NAMESPACE,
      );
      try {
        await this.eventPublisher.publish(
          ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED,
          {
            eventId,
            eventType: DomainEventType.TEMP_WAREHOUSE_TRANSFER_REQUESTED,
            timestamp: new Date().toISOString(),
            organizationId: item.payload.organizationId,
            branchId: item.payload.branchId,
            correlationId: session.id,
            payload: item.payload,
          },
          `${session.id}:${item.direction}:partial:${hash}`,
        );
        publishedEvents.push({
          direction: item.direction,
          eventId,
          lineIds: sortedIds,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to publish partial-transfer event for session=${session.id} direction=${item.direction}: ${msg}`,
          err instanceof Error ? err.stack : undefined,
        );
        throw err;
      }
    }

    return { session, publishedEvents };
  }

  /**
   * Flip the listed lines from ACTIVE to TRANSFERRED with the resulting transferId.
   * Called by the partial-transfer consumer after the stock transfer is POSTED.
   * Filter status=ACTIVE so replays never override an already-recorded transferId.
   */
  async markLinesTransferred(
    sessionId: string,
    lineIds: string[],
    transferId: string,
    organizationId: string,
  ): Promise<void> {
    if (lineIds.length === 0) return;
    await this.lineRepo.update(
      {
        id: In(lineIds),
        sessionId,
        organizationId,
        status: TempWarehouseLineStatus.ACTIVE,
      },
      {
        status: TempWarehouseLineStatus.TRANSFERRED,
        transferId,
      },
    );
  }

  /**
   * Follow a line's supersededById chain to its current ACTIVE version.
   * Returns the ACTIVE line, or null when the chain dead-ends at a deleted /
   * already-transferred line with no ACTIVE successor. A seen-set bounds the
   * walk against cyclic data.
   */
  private async resolveActiveLine(
    manager: ReturnType<DataSource['createEntityManager']>,
    start: TempWarehouseLineEntity,
    sessionId: string,
    organizationId: string,
  ): Promise<TempWarehouseLineEntity | null> {
    let current = start;
    const seen = new Set<string>();
    while (current.status !== TempWarehouseLineStatus.ACTIVE) {
      if (!current.supersededById || seen.has(current.id)) return null;
      seen.add(current.id);
      const next = await manager.findOne(TempWarehouseLineEntity, {
        where: {
          id: current.supersededById,
          sessionId,
          organizationId,
        },
      });
      if (!next) return null;
      current = next;
    }
    return current;
  }

  /** Consumer-side lookup for the partial-transfer defensive replay check. */
  async findLinesByIds(
    lineIds: string[],
    organizationId: string,
  ): Promise<TempWarehouseLineEntity[]> {
    if (lineIds.length === 0) return [];
    return this.lineRepo.find({
      where: { id: In(lineIds), organizationId },
    });
  }
}
