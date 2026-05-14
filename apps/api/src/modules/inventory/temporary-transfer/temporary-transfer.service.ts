import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
  StockMovementType,
  TemporaryTransferStatus,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { InventoryLocationService } from '../location/inventory-location.service';
import { TemporaryTransferEntity } from './temporary-transfer.entity';
import { TemporaryTransferLineEntity } from './temporary-transfer-line.entity';
import { CreateTemporaryTransferDto } from './dto/create-temporary-transfer.dto';
import { ReturnTemporaryTransferDto } from './dto/return-temporary-transfer.dto';

const REF_TYPE = 'TEMP_TRANSFER';

export interface TemporaryTransferQuery extends PaginationQuery {
  status?: TemporaryTransferStatus;
  branchId?: string;
  carrierUserId?: string;
}

export interface OutstandingItemRow {
  transferId: string;
  lineId: string;
  postedAt: Date;
  documentNumber?: string;
  carrierUserId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  sourceLocationId: string;
  sourceLocationCode: string;
  quantity: number;
  returnedQuantity: number;
  outstandingQuantity: number;
}

@Injectable()
export class TemporaryTransferService {
  private readonly logger = new Logger(TemporaryTransferService.name);

  constructor(
    @InjectRepository(TemporaryTransferEntity)
    private readonly transferRepo: Repository<TemporaryTransferEntity>,
    @InjectRepository(TemporaryTransferLineEntity)
    private readonly lineRepo: Repository<TemporaryTransferLineEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    private readonly locationService: InventoryLocationService,
  ) {}

  async create(
    dto: CreateTemporaryTransferDto,
    actor: ActorContext,
  ): Promise<TemporaryTransferEntity> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phiếu chuyển kho tạm phải có ít nhất 1 dòng');
    }

    const branchId = dto.sourceBranchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Không xác định được chi nhánh nguồn');
    }

    const tempLocation = await this.locationService.getOrCreateMainTemporaryLocation(
      branchId,
      actor,
    );

    for (const line of dto.lines) {
      if (line.quantity <= 0) {
        throw new BadRequestException('Số lượng từng dòng phải lớn hơn 0');
      }
      if (line.sourceLocationId === tempLocation.id) {
        throw new BadRequestException(
          'Vị trí nguồn không được trùng với kho tạm đích',
        );
      }
      const balance = await this.balanceRepo.findOne({
        where: {
          organizationId: actor.organizationId,
          itemId: line.itemId,
          locationId: line.sourceLocationId,
        },
      });
      const available = balance ? Number(balance.quantity) : 0;
      if (available < line.quantity) {
        throw new BadRequestException(
          `Tồn kho tại vị trí nguồn không đủ cho mặt hàng ${line.itemId} (còn ${available}, cần ${line.quantity})`,
        );
      }
    }

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.TEMPORARY_TRANSFER,
      branchId,
      actor,
    );

    const transferId = await this.dataSource.transaction(async (manager) => {
      const transfer = manager.create(TemporaryTransferEntity, {
        organizationId: actor.organizationId,
        branchId,
        sourceBranchId: branchId,
        destinationTempLocationId: tempLocation.id,
        carrierUserId: dto.carrierUserId,
        status: TemporaryTransferStatus.OPEN,
        notes: dto.notes,
        documentNumber,
        postedAt: new Date(),
        postedBy: actor.userId,
        createdBy: actor.userId,
        lines: dto.lines.map((l) => {
          const line = new TemporaryTransferLineEntity();
          line.itemId = l.itemId;
          line.sourceLocationId = l.sourceLocationId;
          line.quantity = l.quantity;
          line.returnedQuantity = 0;
          line.notes = l.notes;
          return line;
        }),
      });
      const saved = await manager.save(TemporaryTransferEntity, transfer);

      const movements: RecordMovementParams[] = [];
      for (const line of saved.lines) {
        movements.push({
          itemId: line.itemId,
          locationId: line.sourceLocationId,
          branchId,
          organizationId: actor.organizationId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: -Number(line.quantity),
          referenceType: REF_TYPE,
          referenceId: saved.id,
          notes: `Chuyển kho tạm: ${documentNumber}`,
          actorContext: actor,
        });
        movements.push({
          itemId: line.itemId,
          locationId: tempLocation.id,
          branchId,
          organizationId: actor.organizationId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: Number(line.quantity),
          referenceType: REF_TYPE,
          referenceId: saved.id,
          notes: `Chuyển kho tạm: ${documentNumber}`,
          actorContext: actor,
        });
      }
      await this.ledgerService.recordBatchMovements(movements);

      return saved.id;
    });

    this.logger.log(`Temporary transfer ${transferId} posted as ${documentNumber}`);
    return this.findOrFail(transferId, actor.organizationId);
  }

  async returnLines(
    id: string,
    dto: ReturnTemporaryTransferDto,
    actor: ActorContext,
  ): Promise<TemporaryTransferEntity> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Phải chỉ định ít nhất 1 dòng để trả');
    }

    const transfer = await this.findOrFail(id, actor.organizationId);

    if (
      transfer.status === TemporaryTransferStatus.FULLY_RETURNED ||
      transfer.status === TemporaryTransferStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Phiếu ${transfer.documentNumber ?? id} đã ${transfer.status === TemporaryTransferStatus.CANCELLED ? 'bị hủy' : 'trả đủ'}, không thể trả thêm`,
      );
    }

    const lineMap = new Map(transfer.lines.map((l) => [l.id, l]));
    for (const r of dto.lines) {
      const line = lineMap.get(r.lineId);
      if (!line) {
        throw new NotFoundException(`Dòng ${r.lineId} không thuộc phiếu này`);
      }
      const remaining = Number(line.quantity) - Number(line.returnedQuantity);
      if (r.returnQuantity <= 0 || r.returnQuantity > remaining) {
        throw new BadRequestException(
          `Số lượng trả của dòng ${r.lineId} phải nằm trong khoảng (0, ${remaining}]`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];

      for (const r of dto.lines) {
        const line = lineMap.get(r.lineId)!;
        const newReturned = Number(line.returnedQuantity) + Number(r.returnQuantity);
        await manager.update(
          TemporaryTransferLineEntity,
          { id: line.id },
          { returnedQuantity: newReturned },
        );
        line.returnedQuantity = newReturned;

        movements.push({
          itemId: line.itemId,
          locationId: transfer.destinationTempLocationId,
          branchId: transfer.branchId!,
          organizationId: actor.organizationId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: -Number(r.returnQuantity),
          referenceType: REF_TYPE,
          referenceId: transfer.id,
          notes: `Trả kho tạm: ${transfer.documentNumber}`,
          actorContext: actor,
        });
        movements.push({
          itemId: line.itemId,
          locationId: line.sourceLocationId,
          branchId: transfer.branchId!,
          organizationId: actor.organizationId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: Number(r.returnQuantity),
          referenceType: REF_TYPE,
          referenceId: transfer.id,
          notes: `Trả kho tạm: ${transfer.documentNumber}`,
          actorContext: actor,
        });
      }

      await this.ledgerService.recordBatchMovements(movements);

      const allReturned = transfer.lines.every(
        (l) => Number(l.returnedQuantity) >= Number(l.quantity),
      );
      const newStatus = allReturned
        ? TemporaryTransferStatus.FULLY_RETURNED
        : TemporaryTransferStatus.PARTIALLY_RETURNED;

      await manager.update(
        TemporaryTransferEntity,
        { id: transfer.id },
        {
          status: newStatus,
          returnedAt: allReturned ? new Date() : transfer.returnedAt,
        },
      );
    });

    this.logger.log(`Temporary transfer ${id} returned lines processed`);
    return this.findOrFail(id, actor.organizationId);
  }

  async cancel(id: string, actor: ActorContext): Promise<TemporaryTransferEntity> {
    const transfer = await this.findOrFail(id, actor.organizationId);

    if (transfer.status !== TemporaryTransferStatus.OPEN) {
      throw new BadRequestException(
        `Chỉ phiếu ở trạng thái OPEN mới có thể hủy (hiện tại: ${transfer.status})`,
      );
    }
    const anyReturned = transfer.lines.some(
      (l) => Number(l.returnedQuantity) > 0,
    );
    if (anyReturned) {
      throw new BadRequestException(
        'Không thể hủy phiếu đã có dòng được trả về kho chính',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = [];
      for (const line of transfer.lines) {
        movements.push({
          itemId: line.itemId,
          locationId: transfer.destinationTempLocationId,
          branchId: transfer.branchId!,
          organizationId: actor.organizationId,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: -Number(line.quantity),
          referenceType: REF_TYPE,
          referenceId: transfer.id,
          notes: `Hủy phiếu kho tạm: ${transfer.documentNumber}`,
          actorContext: actor,
        });
        movements.push({
          itemId: line.itemId,
          locationId: line.sourceLocationId,
          branchId: transfer.branchId!,
          organizationId: actor.organizationId,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: Number(line.quantity),
          referenceType: REF_TYPE,
          referenceId: transfer.id,
          notes: `Hủy phiếu kho tạm: ${transfer.documentNumber}`,
          actorContext: actor,
        });
      }
      await this.ledgerService.recordBatchMovements(movements);

      await manager.update(
        TemporaryTransferEntity,
        { id: transfer.id },
        { status: TemporaryTransferStatus.CANCELLED },
      );
    });

    this.logger.log(`Temporary transfer ${id} cancelled`);
    return this.findOrFail(id, actor.organizationId);
  }

  async getById(id: string, actor: ActorContext): Promise<TemporaryTransferEntity> {
    return this.findOrFail(id, actor.organizationId);
  }

  async list(
    query: TemporaryTransferQuery,
    actor: ActorContext,
  ): Promise<PaginatedResponse<TemporaryTransferEntity>> {
    const qb = this.transferRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.lines', 'lines')
      .where('t.organizationId = :orgId', { orgId: actor.organizationId });

    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.branchId) qb.andWhere('t.branchId = :branchId', { branchId: query.branchId });
    if (query.carrierUserId)
      qb.andWhere('t.carrierUserId = :cid', { cid: query.carrierUserId });

    qb.orderBy('t.postedAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async listOutstandingItems(
    query: PaginationQuery & { branchId?: string; carrierUserId?: string; search?: string },
    actor: ActorContext,
  ): Promise<PaginatedResponse<OutstandingItemRow>> {
    const qb = this.lineRepo
      .createQueryBuilder('line')
      .innerJoin(TemporaryTransferEntity, 't', 't.id = line.transferId')
      .innerJoin('items', 'item', 'item.id = line.itemId')
      .innerJoin('locations', 'loc', 'loc.id = line.sourceLocationId')
      .select([
        'line.id            AS "lineId"',
        't.id               AS "transferId"',
        't.postedAt         AS "postedAt"',
        't.documentNumber   AS "documentNumber"',
        't.carrierUserId    AS "carrierUserId"',
        'item.id            AS "itemId"',
        'item.code          AS "itemCode"',
        'item.name          AS "itemName"',
        'item.unit          AS "unit"',
        'loc.id             AS "sourceLocationId"',
        'loc.code           AS "sourceLocationCode"',
        'line.quantity      AS "quantity"',
        'line.returnedQuantity AS "returnedQuantity"',
        '(line.quantity - line.returnedQuantity) AS "outstandingQuantity"',
      ])
      .where('t.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('line.quantity > line.returnedQuantity')
      .andWhere('t.status IN (:...statuses)', {
        statuses: [TemporaryTransferStatus.OPEN, TemporaryTransferStatus.PARTIALLY_RETURNED],
      });

    if (query.branchId) qb.andWhere('t.branchId = :branchId', { branchId: query.branchId });
    if (query.carrierUserId)
      qb.andWhere('t.carrierUserId = :cid', { cid: query.carrierUserId });
    if (query.search) {
      qb.andWhere(
        '(item.code ILIKE :s OR item.name ILIKE :s OR loc.code ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    qb.orderBy('t.postedAt', 'DESC')
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize);

    const [rows, total] = await Promise.all([
      qb.getRawMany<OutstandingItemRow>(),
      qb.getCount(),
    ]);

    return { data: rows, total, page: query.page, pageSize: query.pageSize };
  }

  private async findOrFail(
    id: string,
    organizationId: string,
  ): Promise<TemporaryTransferEntity> {
    const transfer = await this.transferRepo.findOne({
      where: { id, organizationId },
    });
    if (!transfer) {
      throw new NotFoundException(`Phiếu chuyển kho tạm ${id} không tồn tại`);
    }
    return transfer;
  }
}
