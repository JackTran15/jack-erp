import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  DocumentType,
  DomainEventType,
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  RecordMovementParams,
  StockLedgerService,
} from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { GoodsReceiptEntity } from './goods-receipt.entity';
import { GoodsReceiptLineEntity } from './goods-receipt-line.entity';
import { CreateGoodsReceiptDto, GoodsReceiptLineDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';

export interface GoodsReceiptQuery extends PaginationQuery {
  status?: GoodsReceiptStatus;
  purpose?: GoodsReceiptPurpose;
  organizationId: string;
  branchId?: string;
}

@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger(GoodsReceiptService.name);

  constructor(
    @InjectRepository(GoodsReceiptEntity)
    private readonly receiptRepo: Repository<GoodsReceiptEntity>,
    @InjectRepository(GoodsReceiptLineEntity)
    private readonly lineRepo: Repository<GoodsReceiptLineEntity>,
    private readonly dataSource: DataSource,
    private readonly stockLedger: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  // ─── Create (DRAFT) ───────────────────────────────────────────────────────

  async create(dto: CreateGoodsReceiptDto, actor: ActorContext): Promise<GoodsReceiptEntity> {
    this.validateBusinessRules(dto);
    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.GOODS_RECEIPT,
      actor.branchId,
      actor,
    );

    const receipt = this.receiptRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: GoodsReceiptStatus.DRAFT,
      purpose: dto.purpose,
      providerId: dto.providerId,
      deliveredBy: dto.deliveredBy,
      reason: dto.reason,
      description: dto.description,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
      sourceBranchId: dto.sourceBranchId,
      receivedAt: new Date(dto.receivedAt),
      locationId: dto.locationId,
      attachmentIds: dto.attachmentIds ?? [],
      lines: dto.lines.map((l) =>
        this.makeLine(l, actor.organizationId, actor.branchId, actor.userId),
      ),
    });

    const saved = await this.receiptRepo.save(receipt);
    this.logger.log(
      `Goods receipt ${saved.id} created as DRAFT ${documentNumber} by ${actor.userId}`,
    );
    return this.findOrFail(saved.id, actor.organizationId);
  }

  // ─── Update (only DRAFT) ──────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateGoodsReceiptDto,
    actor: ActorContext,
  ): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(id, actor.organizationId);
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException(
        `Chỉ có thể sửa phiếu ở trạng thái DRAFT (hiện tại: ${receipt.status})`,
      );
    }

    if (dto.purpose !== undefined) receipt.purpose = dto.purpose;
    if (dto.providerId !== undefined) receipt.providerId = dto.providerId;
    if (dto.deliveredBy !== undefined) receipt.deliveredBy = dto.deliveredBy;
    if (dto.reason !== undefined) receipt.reason = dto.reason;
    if (dto.description !== undefined) receipt.description = dto.description;
    if (dto.referenceId !== undefined) receipt.referenceId = dto.referenceId;
    if (dto.referenceType !== undefined) receipt.referenceType = dto.referenceType;
    if (dto.sourceBranchId !== undefined) receipt.sourceBranchId = dto.sourceBranchId;
    if (dto.receivedAt !== undefined) receipt.receivedAt = new Date(dto.receivedAt);
    if (dto.locationId !== undefined) receipt.locationId = dto.locationId;
    if (dto.attachmentIds !== undefined) receipt.attachmentIds = dto.attachmentIds;

    // Re-validate combined state
    this.validateBusinessRules({
      ...receipt,
      purpose: receipt.purpose,
      providerId: receipt.providerId,
      referenceId: receipt.referenceId,
      referenceType: receipt.referenceType,
      lines: dto.lines ?? (receipt.lines as unknown as GoodsReceiptLineDto[]),
    } as unknown as CreateGoodsReceiptDto);

    if (dto.lines) {
      await this.lineRepo.delete({ goodsReceiptId: receipt.id });
      receipt.lines = dto.lines.map((l) =>
        this.makeLine(l, receipt.organizationId, receipt.branchId, actor.userId),
      );
    }

    const saved = await this.receiptRepo.save(receipt);
    this.logger.log(`Goods receipt ${id} updated (DRAFT) by ${actor.userId}`);
    return this.findOrFail(saved.id, actor.organizationId);
  }

  // ─── Soft cancel (DRAFT only) ─────────────────────────────────────────────

  async cancel(id: string, actor: ActorContext): Promise<void> {
    const receipt = await this.findOrFail(id, actor.organizationId);
    if (
      receipt.status === GoodsReceiptStatus.CANCELLED ||
      receipt.status === GoodsReceiptStatus.REVERSED
    ) {
      throw new ConflictException(
        `Phiếu đã ${receipt.status === GoodsReceiptStatus.CANCELLED ? 'huỷ' : 'đảo bút'}, không thể xoá lại`,
      );
    }

    if (receipt.status === GoodsReceiptStatus.POSTED) {
      const branchId = receipt.branchId ?? actor.branchId;
      if (!branchId) {
        throw new BadRequestException(
          'Không xác định được chi nhánh để đảo bút tồn kho',
        );
      }
      await this.dataSource.transaction(async () => {
        const reversals: RecordMovementParams[] = receipt.lines.map((line) => ({
          itemId: line.itemId,
          locationId: line.locationId,
          branchId,
          organizationId: receipt.organizationId,
          movementType: StockMovementType.ADJUSTMENT_DECREASE,
          quantity: -Number(line.quantity),
          referenceType: 'GOODS_RECEIPT',
          referenceId: receipt.id,
          notes: `Huỷ phiếu nhập kho ${receipt.documentNumber ?? receipt.id}`,
          actorContext: actor,
        }));
        await this.stockLedger.recordBatchMovements(reversals);
      });
    }

    receipt.status = GoodsReceiptStatus.CANCELLED;
    await this.receiptRepo.save(receipt);
    await this.receiptRepo.softDelete(receipt.id);
    this.logger.log(`Goods receipt ${id} cancelled by ${actor.userId}`);
  }

  // ─── Post (DRAFT → POSTED, atomic) ────────────────────────────────────────

  async post(id: string, actor: ActorContext): Promise<GoodsReceiptEntity> {
    const receipt = await this.findOrFail(id, actor.organizationId);
    if (receipt.status !== GoodsReceiptStatus.DRAFT) {
      throw new ConflictException(
        `Chỉ có thể duyệt phiếu DRAFT (hiện tại: ${receipt.status})`,
      );
    }
    if (!receipt.lines || receipt.lines.length === 0) {
      throw new BadRequestException('Phiếu nhập kho không có dòng hàng');
    }

    const branchId = receipt.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Không xác định được chi nhánh để hạch toán tồn kho');
    }

    // documentNumber is now assigned at create-time. Reuse it on post so the
    // identifier stays stable across the DRAFT → POSTED transition. Fall back
    // to generating one only if the receipt somehow predates that change.
    const documentNumber =
      receipt.documentNumber ??
      (await this.documentNumberingService.generate(
        DocumentType.GOODS_RECEIPT,
        receipt.branchId,
        actor,
      ));

    const movementType =
      receipt.purpose === GoodsReceiptPurpose.TRANSFER_IN
        ? StockMovementType.TRANSFER_IN
        : StockMovementType.PURCHASE_RECEIPT;

    await this.dataSource.transaction(async (manager) => {
      await manager.update(GoodsReceiptEntity, receipt.id, {
        status: GoodsReceiptStatus.POSTED,
        documentNumber,
        postedAt: new Date(),
        postedBy: actor.userId,
      });

      const movements: RecordMovementParams[] = receipt.lines.map((line) => ({
        itemId: line.itemId,
        locationId: line.locationId,
        branchId,
        organizationId: receipt.organizationId,
        movementType,
        quantity: Number(line.quantity),
        referenceType: 'GOODS_RECEIPT',
        referenceId: receipt.id,
        notes: `Phiếu nhập kho ${documentNumber}`,
        actorContext: actor,
      }));
      await this.stockLedger.recordBatchMovements(movements);
    });

    await this.eventPublisher.publish('inventory.goods_receipt.posted', {
      eventId: randomUUID(),
      eventType: DomainEventType.GOODS_RECEIPT_POSTED,
      timestamp: new Date().toISOString(),
      organizationId: receipt.organizationId,
      branchId,
      correlationId: randomUUID(),
      payload: {
        receiptId: receipt.id,
        documentNumber,
        purpose: receipt.purpose,
        providerId: receipt.providerId,
        totalAmount: receipt.lines.reduce(
          (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
          0,
        ),
        lineCount: receipt.lines.length,
        postedAt: new Date().toISOString(),
        postedBy: actor.userId,
      },
    });

    this.logger.log(`Goods receipt ${id} posted as ${documentNumber} by ${actor.userId}`);
    return this.findOrFail(id, actor.organizationId);
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async getById(id: string, organizationId: string): Promise<GoodsReceiptEntity> {
    return this.findOrFail(id, organizationId);
  }

  async list(query: GoodsReceiptQuery): Promise<PaginatedResponse<GoodsReceiptEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) where.status = query.status;
    if (query.purpose) where.purpose = query.purpose;
    if (query.branchId) where.branchId = query.branchId;

    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const [data, total] = await this.receiptRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { receivedAt: 'DESC' },
    });

    return { data, total, page, pageSize };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findOrFail(id: string, organizationId: string): Promise<GoodsReceiptEntity> {
    const receipt = await this.receiptRepo.findOne({ where: { id, organizationId } });
    if (!receipt) throw new NotFoundException(`Phiếu nhập kho ${id} không tìm thấy`);
    return receipt;
  }

  private validateBusinessRules(dto: CreateGoodsReceiptDto): void {
    if (dto.purpose === GoodsReceiptPurpose.OTHER && !dto.providerId) {
      throw new BadRequestException('Cần chọn đối tượng (NCC) khi mục đích là "Khác"');
    }
    if (dto.purpose === GoodsReceiptPurpose.TRANSFER_IN) {
      // referenceId / referenceType strictly required per design doc when a transfer doc exists;
      // we relax this to "warn-but-allow" while stock-transfer module isn't wired to UI.
      if (!dto.sourceBranchId && !dto.referenceId) {
        throw new BadRequestException(
          'Phiếu điều chuyển cần chi nhánh nguồn hoặc tham chiếu phiếu điều chuyển',
        );
      }
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phiếu phải có ít nhất một dòng hàng');
    }
    for (const line of dto.lines) {
      if (Number(line.quantity) <= 0) {
        throw new BadRequestException('Số lượng phải lớn hơn 0');
      }
      if (Number(line.unitPrice) < 0) {
        throw new BadRequestException('Đơn giá không được âm');
      }
    }
  }

  private makeLine(
    src: GoodsReceiptLineDto,
    organizationId: string,
    branchId: string | undefined,
    createdBy: string,
  ): GoodsReceiptLineEntity {
    const line = new GoodsReceiptLineEntity();
    line.organizationId = organizationId;
    line.branchId = branchId;
    line.createdBy = createdBy;
    line.itemId = src.itemId;
    line.locationId = src.locationId;
    line.binId = src.binId;
    line.uomCode = src.uomCode;
    line.quantity = String(src.quantity);
    line.unitPrice = String(src.unitPrice);
    line.lineTotal = (Number(src.quantity) * Number(src.unitPrice)).toFixed(2);
    line.note = src.note;
    return line;
  }
}
