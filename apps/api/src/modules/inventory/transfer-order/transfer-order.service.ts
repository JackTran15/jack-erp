import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaginatedResponse,
  PaginationQuery,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';

export interface CreateTransferOrderDto {
  sourceBranchId: string;
  destinationBranchId: string;
  sourceStorageId?: string;
  destinationStorageId?: string;
  requestedDate?: string;
  notes?: string;
  lines: { itemId: string; requestedQty: number; note?: string }[];
}

export interface TransferOrderQuery extends PaginationQuery {
  status?: TransferOrderStatus;
  organizationId: string;
}

@Injectable()
export class TransferOrderService {
  private readonly logger = new Logger(TransferOrderService.name);

  constructor(
    @InjectRepository(TransferOrderEntity)
    private readonly toRepo: Repository<TransferOrderEntity>,
  ) {}

  async create(
    dto: CreateTransferOrderDto,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Lệnh điều chuyển phải có ít nhất 1 dòng');
    }
    for (const l of dto.lines) {
      if (Number(l.requestedQty) <= 0) {
        throw new BadRequestException('Số lượng yêu cầu phải lớn hơn 0');
      }
    }
    if (dto.sourceBranchId === dto.destinationBranchId && !dto.sourceStorageId) {
      throw new BadRequestException(
        'Điều chuyển trong cùng chi nhánh phải chỉ định kho nguồn',
      );
    }

    const to = this.toRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      status: TransferOrderStatus.DRAFT,
      sourceBranchId: dto.sourceBranchId,
      destinationBranchId: dto.destinationBranchId,
      sourceStorageId: dto.sourceStorageId,
      destinationStorageId: dto.destinationStorageId,
      requestedDate: dto.requestedDate,
      notes: dto.notes,
      lines: dto.lines.map((l) => {
        const line = new TransferOrderLineEntity();
        line.organizationId = actor.organizationId;
        line.branchId = actor.branchId;
        line.createdBy = actor.userId;
        line.itemId = l.itemId;
        line.requestedQty = String(l.requestedQty);
        line.note = l.note;
        return line;
      }),
    });

    const saved = await this.toRepo.save(to);
    this.logger.log(`Transfer order ${saved.id} created as DRAFT`);
    return this.findOrFail(saved.id, actor.organizationId);
  }

  async approve(id: string, actor: ActorContext): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (to.status !== TransferOrderStatus.DRAFT) {
      throw new ConflictException('Chỉ duyệt được lệnh ở trạng thái DRAFT');
    }
    to.status = TransferOrderStatus.APPROVED;
    to.approvedAt = new Date();
    to.approvedBy = actor.userId;
    return this.toRepo.save(to);
  }

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (
      to.status === TransferOrderStatus.EXECUTED ||
      to.status === TransferOrderStatus.CANCELLED
    ) {
      throw new ConflictException('Không thể huỷ lệnh đã thực hiện hoặc đã huỷ');
    }
    to.status = TransferOrderStatus.CANCELLED;
    await this.toRepo.save(to);
    await this.toRepo.softDelete(to.id);
  }

  /**
   * Mark order as executed. Caller passes the spawned StockTransfer id
   * (created via the existing stock-transfer service). Service just records
   * the link — doesn't create the transfer itself to keep modules decoupled.
   */
  async markExecuted(
    id: string,
    transferId: string,
    actor: ActorContext,
  ): Promise<TransferOrderEntity> {
    const to = await this.findOrFail(id, actor.organizationId);
    if (to.status !== TransferOrderStatus.APPROVED) {
      throw new ConflictException('Lệnh phải ở trạng thái APPROVED mới thực hiện được');
    }
    to.status = TransferOrderStatus.EXECUTED;
    to.executedAt = new Date();
    to.executedBy = actor.userId;
    to.executedTransferId = transferId;
    return this.toRepo.save(to);
  }

  async getById(id: string, organizationId: string): Promise<TransferOrderEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(
    query: TransferOrderQuery,
  ): Promise<PaginatedResponse<TransferOrderEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.toRepo.findAndCount({
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
  ): Promise<TransferOrderEntity> {
    const to = await this.toRepo.findOne({ where: { id, organizationId } });
    if (!to) throw new NotFoundException(`Lệnh điều chuyển ${id} không tìm thấy`);
    return to;
  }
}
