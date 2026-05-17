import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository, QueryFailedError } from 'typeorm';
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
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { EventPublisher } from '../../events/event-publisher.service';
import { TempWarehouseSessionEntity } from './temp-warehouse-session.entity';
import { TempWarehouseLineEntity } from './temp-warehouse-line.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';
import { UserEntity } from '../../auth/user.entity';
import { UserBranchAssignmentEntity } from '../../branch/user-branch-assignment.entity';
import { BranchLocationResolverService } from './branch-location-resolver.service';
import { AddTempWarehouseLineDto } from './dto/add-line.dto';
import { UpdateTempWarehouseLineDto } from './dto/update-line.dto';
import { ListTempWarehouseLinesQueryDto } from './dto/list-lines.query';
import { CloseTempWarehouseSessionDto } from './dto/close-session.dto';
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

export interface CloseSessionResult {
  session: TempWarehouseSessionEntity;
  autoBalancedLines?: TempWarehouseLineEntity[];
  publishedEvents?: { direction: TempWarehouseDirection; eventId: string }[];
}

const PG_UNIQUE_VIOLATION = '23505';

// Stable namespace UUID for deriving deterministic event IDs from (sessionId, direction).
// Any fixed v4 UUID works — must not change once events have been published in production.
const TEMP_WAREHOUSE_EVENT_NAMESPACE = '7b2f3c84-1d6e-4a9c-9b25-3f8a4e1c0d77';

@Injectable()
export class TempWarehouseService {
  private readonly logger = new Logger(TempWarehouseService.name);

  constructor(
    @InjectRepository(TempWarehouseSessionEntity)
    private readonly sessionRepo: Repository<TempWarehouseSessionEntity>,
    @InjectRepository(TempWarehouseLineEntity)
    private readonly lineRepo: Repository<TempWarehouseLineEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly stockBalanceRepo: Repository<StockBalanceEntity>,
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
    private readonly eventPublisher: EventPublisher,
  ) {}

  // ─── Session reads ──────────────────────────────────────────────────

  async getActiveSession(
    branchId: string,
    actor: ActorContext,
  ): Promise<TempWarehouseSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: {
        branchId,
        organizationId: actor.organizationId,
        status: TempWarehouseSessionStatus.ACTIVE,
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

    const qb = this.userRepo
      .createQueryBuilder('u')
      .innerJoin(
        UserBranchAssignmentEntity,
        'uba',
        'uba.user_id = u.id AND uba.branch_id = :branchId AND uba.organization_id = :orgId',
        { branchId: query.branchId, orgId: actor.organizationId },
      )
      .where('u.organization_id = :orgId', { orgId: actor.organizationId })
      .andWhere('u.is_active = TRUE');

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(u.first_name ILIKE :term OR u.last_name ILIKE :term OR u.email ILIKE :term)',
        { term },
      );
    }

    const [users, total] = await qb
      .orderBy('u.first_name', 'ASC')
      .addOrderBy('u.last_name', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

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
        },
      });

      if (!session) {
        const { warehouseLocationId, showroomLocationId } =
          await this.locationResolver.resolve(dto.branchId, actor.organizationId);

        const newSession = manager.create(TempWarehouseSessionEntity, {
          organizationId: actor.organizationId,
          branchId: dto.branchId,
          status: TempWarehouseSessionStatus.ACTIVE,
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
            // Race: a concurrent request opened the session first.
            session = await manager.findOne(TempWarehouseSessionEntity, {
              where: {
                branchId: dto.branchId,
                organizationId: actor.organizationId,
                status: TempWarehouseSessionStatus.ACTIVE,
              },
            });
            if (!session) throw err;
          } else {
            throw err;
          }
        }
      }

      const resolvedDirection =
        dto.direction ??
        (await this.resolveDirectionFromStock(
          dto.itemId,
          session!.warehouseLocationId,
          session!.showroomLocationId,
          actor.organizationId,
        ));

      const line = manager.create(TempWarehouseLineEntity, {
        organizationId: actor.organizationId,
        branchId: dto.branchId,
        sessionId: session!.id,
        itemId: dto.itemId,
        direction: resolvedDirection,
        quantity: '1.00',
        carrierUserId: dto.carrierUserId,
        notes: dto.notes,
        status: TempWarehouseLineStatus.ACTIVE,
        createdBy: actor.userId,
      });
      const savedLine = await manager.save(line);

      this.logger.log(
        `Added line ${savedLine.id} to session ${session!.id} (direction=${resolvedDirection})`,
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
      dto.notes === undefined
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

    const sessionId = await this.resolveSessionId(query, actor);
    if (!sessionId) {
      return query.hideOffsetting
        ? { sessionId: null, items: [] }
        : {
            sessionId: null,
            data: [],
            total: 0,
            page: query.page ?? 1,
            pageSize: query.pageSize ?? 50,
          };
    }

    if (query.hideOffsetting) {
      const items = await this.computeNettedView(
        sessionId,
        actor.organizationId,
        !!query.hideBalanced,
      );
      return { sessionId, items };
    }

    const statusFilter =
      !query.status || query.status === 'ALL'
        ? undefined
        : (query.status as TempWarehouseLineStatus);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    // Hard-exclude TRANSFERRED from every raw-mode listing, including status=ALL.
    const qb = this.lineRepo
      .createQueryBuilder('l')
      .where('l.session_id = :sessionId', { sessionId })
      .andWhere('l.organization_id = :orgId', {
        orgId: actor.organizationId,
      })
      .andWhere('l.status != :transferred', {
        transferred: TempWarehouseLineStatus.TRANSFERRED,
      });

    if (statusFilter) {
      qb.andWhere('l.status = :status', { status: statusFilter });
    } else if (!query.status) {
      qb.andWhere('l.status = :active', {
        active: TempWarehouseLineStatus.ACTIVE,
      });
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
      const s = await this.getActiveSession(query.branchId, actor);
      return s?.id ?? null;
    }
    throw new BadRequestException({
      code: 'TEMP_WAREHOUSE_LIST_MISSING_SCOPE',
      message: 'Either branchId or sessionId must be provided',
    });
  }

  private async computeNettedView(
    sessionId: string,
    organizationId: string,
    hideBalanced: boolean,
  ): Promise<NettedLineView[]> {
    const lines = await this.lineRepo.find({
      where: {
        sessionId,
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

  private async resolveDirectionFromStock(
    itemId: string,
    warehouseLocationId: string,
    showroomLocationId: string,
    organizationId: string,
  ): Promise<TempWarehouseDirection> {
    const balances = await this.stockBalanceRepo.find({
      where: [
        { itemId, locationId: warehouseLocationId, organizationId },
        { itemId, locationId: showroomLocationId, organizationId },
      ],
    });
    const wQty = Number(
      balances.find((b) => b.locationId === warehouseLocationId)?.quantity ?? 0,
    );
    const sQty = Number(
      balances.find((b) => b.locationId === showroomLocationId)?.quantity ?? 0,
    );
    if (wQty > 0 && sQty <= 0) {
      return TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
    }
    if (sQty > 0 && wQty <= 0) {
      return TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE;
    }
    if (wQty <= 0 && sQty <= 0) {
      throw new BadRequestException({
        code: 'TEMP_WAREHOUSE_ITEM_NO_STOCK',
        message: `Item ${itemId} has no stock at either main warehouse or main showroom for this branch`,
      });
    }
    throw new BadRequestException({
      code: 'TEMP_WAREHOUSE_DIRECTION_AMBIGUOUS',
      message: `Item ${itemId} has stock at both main warehouse and main showroom; explicit direction is required`,
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

  async closeSession(
    sessionId: string,
    dto: CloseTempWarehouseSessionDto,
    actor: ActorContext,
  ): Promise<CloseSessionResult> {
    type PublishItem = {
      direction: TempWarehouseDirection;
      payload: TempWarehouseTransferRequestedPayload;
    };
    const publishPlan: PublishItem[] = [];
    let alreadyClosedReplay: CloseSessionResult | null = null;

    const txResult = await this.dataSource.transaction(async (manager) => {
      const session = await manager.findOne(TempWarehouseSessionEntity, {
        where: { id: sessionId, organizationId: actor.organizationId },
      });
      if (!session) {
        throw new NotFoundException({
          code: 'TEMP_WAREHOUSE_SESSION_NOT_FOUND',
          message: `Session ${sessionId} not found`,
        });
      }

      // Defensive idempotency: session already CLOSED — return current state if same mode, 409 otherwise.
      if (session.status === TempWarehouseSessionStatus.CLOSED) {
        if (session.closeMode === dto.mode) {
          this.logger.log(
            `closeSession ${sessionId} replay-detected (mode=${dto.mode}) → returning current state`,
          );
          alreadyClosedReplay = { session };
          return null;
        }
        throw new ConflictException({
          code: 'TEMP_WAREHOUSE_SESSION_ALREADY_CLOSED_DIFFERENT_MODE',
          message: `Session already CLOSED with mode=${session.closeMode}; cannot re-close with mode=${dto.mode}`,
        });
      }

      const activeLines = await manager.find(TempWarehouseLineEntity, {
        where: { sessionId, status: TempWarehouseLineStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });

      const patch: Partial<TempWarehouseSessionEntity> = {
        status: TempWarehouseSessionStatus.CLOSED,
        closeMode: dto.mode,
        closedBy: actor.userId,
        closedAt: new Date(),
        transferProcessingStatus: TempWarehouseTransferProcessingStatus.NONE,
      };
      let autoBalancedLines: TempWarehouseLineEntity[] | undefined;

      if (dto.mode === TempWarehouseCloseMode.NET_OFFSET) {
        autoBalancedLines = await this.buildAutoBalancedLines(
          manager,
          session,
          activeLines,
          actor,
        );
      } else if (dto.mode === TempWarehouseCloseMode.CREATE_TRANSFERS) {
        const w2sLines = activeLines.filter(
          (l) => l.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        );
        const s2wLines = activeLines.filter(
          (l) => l.direction === TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
        );

        if (w2sLines.length === 0 && s2wLines.length === 0) {
          // No lines to publish — treat as NONE.
          patch.transferProcessingStatus =
            TempWarehouseTransferProcessingStatus.NONE;
        } else {
          patch.transferProcessingStatus =
            TempWarehouseTransferProcessingStatus.PENDING;
          if (w2sLines.length > 0) {
            publishPlan.push({
              direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
              payload: this.buildEventPayload(
                session,
                TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
                w2sLines,
                actor,
              ),
            });
          }
          if (s2wLines.length > 0) {
            publishPlan.push({
              direction: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
              payload: this.buildEventPayload(
                session,
                TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
                s2wLines,
                actor,
              ),
            });
          }
        }
      }

      await manager.update(TempWarehouseSessionEntity, sessionId, patch);
      const refreshed = (await manager.findOne(TempWarehouseSessionEntity, {
        where: { id: sessionId },
      }))!;

      return {
        session: refreshed,
        autoBalancedLines,
      };
    });

    if (alreadyClosedReplay) return alreadyClosedReplay;

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
      session: txResult!.session,
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
    session: TempWarehouseSessionEntity,
    activeLines: TempWarehouseLineEntity[],
    actor: ActorContext,
  ): Promise<TempWarehouseLineEntity[]> {
    // Defensive idempotency: if AUTO_BALANCED lines already exist, return them and skip insert.
    const existing = await manager.find(TempWarehouseLineEntity, {
      where: { sessionId: session.id, status: TempWarehouseLineStatus.AUTO_BALANCED },
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
      const compensate = manager.create(TempWarehouseLineEntity, {
        organizationId: session.organizationId,
        branchId: session.branchId,
        sessionId: session.id,
        itemId,
        direction:
          diff > 0
            ? TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE
            : TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
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

  // Mark in-flight pending → completed when both directions done (called by consumer).
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

        const notTransferable = loaded.filter(
          (l) => l.status !== TempWarehouseLineStatus.ACTIVE,
        );
        if (notTransferable.length > 0) {
          throw new BadRequestException({
            code: 'TEMP_WAREHOUSE_LINES_NOT_TRANSFERABLE',
            message: `Lines are not ACTIVE and cannot be transferred`,
            offendingLines: notTransferable.map((l) => ({
              id: l.id,
              status: l.status,
            })),
          });
        }

        const w2sLines = loaded.filter(
          (l) => l.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        );
        const s2wLines = loaded.filter(
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
