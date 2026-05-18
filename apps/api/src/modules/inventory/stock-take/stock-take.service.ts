import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
  StockTakeStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockTakeEntity } from './stock-take.entity';
import { StockTakeLineEntity } from './stock-take-line.entity';

export interface CreateStockTakeDto {
  storageId?: string;
  locationId?: string;
  notes?: string;
}

export interface UpdateLineCountDto {
  countedQty: number | null;
  note?: string;
}

export interface StockTakeQuery extends PaginationQuery {
  status?: StockTakeStatus;
  organizationId: string;
}

@Injectable()
export class StockTakeService {
  private readonly logger = new Logger(StockTakeService.name);

  constructor(
    @InjectRepository(StockTakeEntity)
    private readonly stRepo: Repository<StockTakeEntity>,
    @InjectRepository(StockTakeLineEntity)
    private readonly lineRepo: Repository<StockTakeLineEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    private readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
  ) {}

  /**
   * Create a new stock-take session. Snapshots the current stock_balances
   * scoped to the provided storage or location into lines with expectedQty.
   * Counted qty is left null until user enters counts.
   */
  async create(
    dto: CreateStockTakeDto,
    actor: ActorContext,
  ): Promise<StockTakeEntity> {
    if (!dto.storageId && !dto.locationId) {
      throw new BadRequestException(
        'Cần chọn kho hoặc vị trí để khởi tạo phiếu kiểm kê',
      );
    }

    const qb = this.balanceRepo
      .createQueryBuilder('sb')
      .innerJoin('locations', 'loc', 'loc.id = sb.location_id')
      .where('sb.organization_id = :orgId', { orgId: actor.organizationId });
    if (dto.locationId) {
      qb.andWhere('sb.location_id = :locId', { locId: dto.locationId });
    } else if (dto.storageId) {
      qb.andWhere('loc.storage_id = :sid', { sid: dto.storageId });
    }
    const balances = await qb.getMany();

    if (balances.length === 0) {
      throw new BadRequestException(
        'Không có hàng hóa nào trong phạm vi đã chọn để kiểm kê',
      );
    }

    const st = this.stRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      status: StockTakeStatus.DRAFT,
      storageId: dto.storageId,
      locationId: dto.locationId,
      snapshotAt: new Date(),
      notes: dto.notes,
      lines: balances.map((b) => {
        const line = new StockTakeLineEntity();
        line.organizationId = actor.organizationId;
        line.branchId = actor.branchId;
        line.createdBy = actor.userId;
        line.itemId = b.itemId;
        line.locationId = b.locationId;
        line.expectedQty = String(b.quantity);
        line.countedQty = null;
        return line;
      }),
    });

    const saved = await this.stRepo.save(st);
    this.logger.log(
      `Stock-take ${saved.id} created with ${balances.length} lines snapshot`,
    );
    return this.findOrFail(saved.id, actor.organizationId);
  }

  async updateLineCount(
    stockTakeId: string,
    lineId: string,
    dto: UpdateLineCountDto,
    actor: ActorContext,
  ): Promise<StockTakeLineEntity> {
    const st = await this.findOrFail(stockTakeId, actor.organizationId);
    if (st.status !== StockTakeStatus.DRAFT) {
      throw new ConflictException(
        `Chỉ cập nhật được khi phiếu kiểm kê đang ở DRAFT`,
      );
    }
    const line = st.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException(`Dòng ${lineId} không tìm thấy`);

    line.countedQty = dto.countedQty == null ? null : String(dto.countedQty);
    line.note = dto.note ?? line.note;
    return this.lineRepo.save(line);
  }

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const st = await this.findOrFail(id, actor.organizationId);
    if (st.status !== StockTakeStatus.DRAFT) {
      throw new ConflictException('Chỉ huỷ được phiếu DRAFT');
    }
    st.status = StockTakeStatus.CANCELLED;
    await this.stRepo.save(st);
    await this.stRepo.softDelete(st.id);
  }

  /**
   * Post a stock-take. For each line where countedQty differs from expectedQty,
   * record a stock_ledger movement (ADJUSTMENT_INCREASE / ADJUSTMENT_DECREASE)
   * to reconcile the balance to the counted value.
   */
  async post(id: string, actor: ActorContext): Promise<StockTakeEntity> {
    const st = await this.findOrFail(id, actor.organizationId);
    if (st.status !== StockTakeStatus.DRAFT) {
      throw new ConflictException('Chỉ duyệt được phiếu DRAFT');
    }
    if (!st.lines || st.lines.length === 0) {
      throw new BadRequestException('Phiếu kiểm kê không có dòng');
    }

    const branchId = st.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException(
        'Không xác định được chi nhánh để hạch toán điều chỉnh',
      );
    }

    const adjustments = st.lines
      .filter((l) => l.countedQty != null)
      .map((l) => {
        const variance = Number(l.countedQty) - Number(l.expectedQty);
        return { line: l, variance };
      })
      .filter((x) => x.variance !== 0);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(StockTakeEntity, st.id, {
        status: StockTakeStatus.POSTED,
        postedAt: new Date(),
        postedBy: actor.userId,
      });
      for (const adj of adjustments) {
        await this.stockLedger.recordMovement({
          itemId: adj.line.itemId,
          locationId: adj.line.locationId,
          branchId,
          organizationId: st.organizationId,
          movementType:
            adj.variance > 0
              ? StockMovementType.ADJUSTMENT_INCREASE
              : StockMovementType.ADJUSTMENT_DECREASE,
          quantity: adj.variance,
          referenceType: 'STOCK_TAKE',
          referenceId: st.id,
          notes: `Kiểm kê ${st.id.slice(0, 8)} (variance ${adj.variance})`,
          actorContext: actor,
        });
      }
    });

    this.logger.log(
      `Stock-take ${id} posted with ${adjustments.length} adjustments`,
    );
    return this.findOrFail(id, actor.organizationId);
  }

  async getById(id: string, organizationId: string): Promise<StockTakeEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(query: StockTakeQuery): Promise<PaginatedResponse<StockTakeEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.stRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, pageSize };
  }

  private async findOrFail(
    id: string,
    organizationId: string,
  ): Promise<StockTakeEntity> {
    const st = await this.stRepo.findOne({ where: { id, organizationId } });
    if (!st) throw new NotFoundException(`Phiếu kiểm kê ${id} không tìm thấy`);
    return st;
  }
}
