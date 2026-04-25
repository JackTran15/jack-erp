import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  PurchaseOrderStatus,
  StockMovementType,
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { PurchaseOrderEntity } from './purchase-order.entity';
import { PurchaseOrderLineEntity } from './purchase-order-line.entity';

export interface CreatePurchaseOrderDto {
  providerId: string;
  locationId: string;
  expectedDate?: string;
  notes?: string;
  lines: { itemId: string; orderedQuantity: number; unitPrice?: number; notes?: string }[];
}

export interface ReceiveGoodsDto {
  lines: { lineId: string; receivedQuantity: number }[];
}

export interface PurchaseOrderQuery extends PaginationQuery {
  status?: PurchaseOrderStatus;
  organizationId: string;
  branchId?: string;
}

const VALID_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.APPROVED]: [PurchaseOrderStatus.RECEIVING, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.RECEIVING]: [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.RECEIVED]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    @InjectRepository(PurchaseOrderEntity)
    private readonly poRepo: Repository<PurchaseOrderEntity>,
    @InjectRepository(PurchaseOrderLineEntity)
    private readonly lineRepo: Repository<PurchaseOrderLineEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, actor: ActorContext): Promise<PurchaseOrderEntity> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phiếu đặt hàng phải có ít nhất một dòng hàng');
    }

    for (const line of dto.lines) {
      if (line.orderedQuantity <= 0) {
        throw new BadRequestException('Số lượng đặt hàng phải lớn hơn 0');
      }
    }

    const po = this.poRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      providerId: dto.providerId,
      locationId: dto.locationId,
      expectedDate: dto.expectedDate,
      notes: dto.notes,
      status: PurchaseOrderStatus.DRAFT,
      lines: dto.lines.map((l) => {
        const line = new PurchaseOrderLineEntity();
        line.itemId = l.itemId;
        line.orderedQuantity = l.orderedQuantity;
        line.unitPrice = l.unitPrice ?? 0;
        line.receivedQuantity = 0;
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.poRepo.save(po);
    this.logger.log(`Purchase order ${saved.id} created as DRAFT`);
    return saved;
  }

  async approve(id: string, actor: ActorContext): Promise<PurchaseOrderEntity> {
    const po = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(po.status, PurchaseOrderStatus.APPROVED);

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.PURCHASE_ORDER,
      po.branchId,
      actor,
    );

    po.status = PurchaseOrderStatus.APPROVED;
    po.documentNumber = documentNumber;
    po.approvedBy = actor.userId;
    po.approvedAt = new Date();

    const saved = await this.poRepo.save(po);
    this.logger.log(`Purchase order ${id} approved as ${documentNumber} by ${actor.userId}`);
    return saved;
  }

  async receiveGoods(id: string, dto: ReceiveGoodsDto, actor: ActorContext): Promise<PurchaseOrderEntity> {
    const po = await this.findOrFail(id, actor.organizationId);

    if (
      po.status !== PurchaseOrderStatus.APPROVED &&
      po.status !== PurchaseOrderStatus.RECEIVING
    ) {
      throw new BadRequestException(
        `Chỉ có thể nhận hàng khi phiếu ở trạng thái APPROVED hoặc RECEIVING (hiện tại: ${po.status})`,
      );
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phải có ít nhất một dòng nhận hàng');
    }

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];

      for (const receiveItem of dto.lines) {
        const line = po.lines.find((l) => l.id === receiveItem.lineId);
        if (!line) {
          throw new NotFoundException(`Dòng hàng ${receiveItem.lineId} không thuộc phiếu này`);
        }

        if (receiveItem.receivedQuantity <= 0) {
          throw new BadRequestException(`Số lượng nhận phải lớn hơn 0`);
        }

        const remaining = Number(line.orderedQuantity) - Number(line.receivedQuantity);
        if (receiveItem.receivedQuantity > remaining) {
          throw new BadRequestException(
            `Số lượng nhận (${receiveItem.receivedQuantity}) vượt quá số lượng còn lại (${remaining}) cho dòng hàng ${receiveItem.lineId}`,
          );
        }

        await manager.update(PurchaseOrderLineEntity, line.id, {
          receivedQuantity: Number(line.receivedQuantity) + receiveItem.receivedQuantity,
        });

        const branchId = po.branchId ?? actor.branchId;
        if (!branchId) {
          throw new BadRequestException('Không xác định được chi nhánh để nhận hàng');
        }

        movements.push({
          itemId: line.itemId,
          locationId: po.locationId,
          branchId,
          organizationId: po.organizationId,
          movementType: StockMovementType.PURCHASE_RECEIPT,
          quantity: receiveItem.receivedQuantity,
          referenceType: 'PURCHASE_ORDER',
          referenceId: po.id,
          notes: `Nhận hàng từ ${po.documentNumber ?? po.id}`,
          actorContext: actor,
        });
      }

      await this.ledgerService.recordBatchMovements(movements);

      // Reload lines to check overall completion
      const updatedLines = await manager.find(PurchaseOrderLineEntity, {
        where: { purchaseOrderId: po.id },
      });

      const allReceived = updatedLines.every(
        (l) => Number(l.receivedQuantity) >= Number(l.orderedQuantity),
      );
      const anyReceived = updatedLines.some((l) => Number(l.receivedQuantity) > 0);

      const newStatus = allReceived
        ? PurchaseOrderStatus.RECEIVED
        : anyReceived
          ? PurchaseOrderStatus.RECEIVING
          : PurchaseOrderStatus.APPROVED;

      await manager.update(PurchaseOrderEntity, id, { status: newStatus });
    });

    this.logger.log(`Goods received for purchase order ${id} by ${actor.userId}`);
    return this.findOrFail(id, actor.organizationId);
  }

  async cancel(id: string, actor: ActorContext): Promise<PurchaseOrderEntity> {
    const po = await this.findOrFail(id, actor.organizationId);
    this.validateTransition(po.status, PurchaseOrderStatus.CANCELLED);

    po.status = PurchaseOrderStatus.CANCELLED;
    const saved = await this.poRepo.save(po);
    this.logger.log(`Purchase order ${id} cancelled by ${actor.userId}`);
    return saved;
  }

  async getById(id: string, organizationId: string): Promise<PurchaseOrderEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(query: PurchaseOrderQuery): Promise<PaginatedResponse<PurchaseOrderEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;
    if (query.branchId) where.branchId = query.branchId;

    const [data, total] = await this.poRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy ? { [query.sortBy]: query.sortOrder ?? 'asc' } : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async findOrFail(id: string, organizationId: string): Promise<PurchaseOrderEntity> {
    const po = await this.poRepo.findOne({ where: { id, organizationId } });
    if (!po) throw new NotFoundException(`Phiếu đặt hàng ${id} không tìm thấy`);
    return po;
  }

  private validateTransition(current: PurchaseOrderStatus, target: PurchaseOrderStatus): void {
    if (!VALID_TRANSITIONS[current].includes(target)) {
      throw new BadRequestException(
        `Không thể chuyển từ trạng thái ${current} sang ${target}`,
      );
    }
  }
}
