import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  GoodsIssueStatus,
  StockMovementType,
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';

export interface CreateGoodsIssueDto {
  locationId: string;
  reason: string;
  notes?: string;
  lines: { itemId: string; quantity: number; notes?: string }[];
}

export interface GoodsIssueQuery extends PaginationQuery {
  status?: GoodsIssueStatus;
  organizationId: string;
  branchId?: string;
}

const VALID_TRANSITIONS: Record<GoodsIssueStatus, GoodsIssueStatus[]> = {
  [GoodsIssueStatus.DRAFT]: [GoodsIssueStatus.APPROVED, GoodsIssueStatus.CANCELLED],
  [GoodsIssueStatus.APPROVED]: [GoodsIssueStatus.POSTED, GoodsIssueStatus.CANCELLED],
  [GoodsIssueStatus.POSTED]: [],
  [GoodsIssueStatus.CANCELLED]: [],
};

@Injectable()
export class GoodsIssueService {
  private readonly logger = new Logger(GoodsIssueService.name);

  constructor(
    @InjectRepository(GoodsIssueEntity)
    private readonly giRepo: Repository<GoodsIssueEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
  ) {}

  async create(dto: CreateGoodsIssueDto, actor: ActorContext): Promise<GoodsIssueEntity> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phiếu xuất hàng phải có ít nhất một dòng hàng');
    }

    for (const line of dto.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Số lượng xuất phải lớn hơn 0');
      }
    }

    const gi = this.giRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      locationId: dto.locationId,
      reason: dto.reason,
      notes: dto.notes,
      status: GoodsIssueStatus.DRAFT,
      lines: dto.lines.map((l) => {
        const line = new GoodsIssueLineEntity();
        line.itemId = l.itemId;
        line.quantity = l.quantity;
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.giRepo.save(gi);
    this.logger.log(`Goods issue ${saved.id} created as DRAFT`);
    return saved;
  }

  async approve(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(gi.status, GoodsIssueStatus.APPROVED);

    gi.status = GoodsIssueStatus.APPROVED;
    gi.approvedBy = actor.userId;
    gi.approvedAt = new Date();

    const saved = await this.giRepo.save(gi);
    this.logger.log(`Goods issue ${id} approved by ${actor.userId}`);
    return saved;
  }

  async post(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(gi.status, GoodsIssueStatus.POSTED);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.GOODS_ISSUE,
      gi.branchId,
      actor,
    );

    const branchId = gi.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Không xác định được chi nhánh để xuất hàng');
    }

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = gi.lines.map((line) => ({
        itemId: line.itemId,
        locationId: gi.locationId,
        branchId,
        organizationId: gi.organizationId,
        movementType: StockMovementType.GOODS_ISSUE,
        quantity: -line.quantity,
        referenceType: 'GOODS_ISSUE',
        referenceId: gi.id,
        notes: `Xuất hàng: ${documentNumber}`,
        actorContext: actor,
      }));

      await this.ledgerService.recordBatchMovements(movements);

      await manager.update(GoodsIssueEntity, id, {
        status: GoodsIssueStatus.POSTED,
        documentNumber,
        postedBy: actor.userId,
        postedAt: new Date(),
      });
    });

    this.logger.log(`Goods issue ${id} posted as ${documentNumber}`);
    return this.findOrFail(id, actor.organizationId);
  }

  async cancel(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(gi.status, GoodsIssueStatus.CANCELLED);

    gi.status = GoodsIssueStatus.CANCELLED;
    const saved = await this.giRepo.save(gi);
    this.logger.log(`Goods issue ${id} cancelled by ${actor.userId}`);
    return saved;
  }

  async getById(id: string, organizationId: string): Promise<GoodsIssueEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(query: GoodsIssueQuery): Promise<PaginatedResponse<GoodsIssueEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;
    if (query.branchId) where.branchId = query.branchId;

    const [data, total] = await this.giRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy ? { [query.sortBy]: query.sortOrder ?? 'asc' } : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async findOrFail(id: string, organizationId: string): Promise<GoodsIssueEntity> {
    const gi = await this.giRepo.findOne({ where: { id, organizationId } });
    if (!gi) throw new NotFoundException(`Phiếu xuất hàng ${id} không tìm thấy`);
    return gi;
  }

  private validateTransition(current: GoodsIssueStatus, target: GoodsIssueStatus): void {
    if (!VALID_TRANSITIONS[current].includes(target)) {
      throw new BadRequestException(
        `Không thể chuyển từ trạng thái ${current} sang ${target}`,
      );
    }
  }
}
