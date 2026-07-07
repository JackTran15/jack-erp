import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import {
  DocCounterpartyKind,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsIssueStatus,
  StockMovementType,
  DocumentType,
  PaginatedResponse,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StockLedgerService, RecordMovementParams } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { resolveDocCounterparty } from '../location/services/resolve-doc-counterparty.util';
import { attachCounterparties } from '../location/services/counterparty-name.util';
import { TransferOrderService } from '../transfer-order/transfer-order.service';
import { RbacService } from '../../rbac/rbac.service';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';
import { assertPurposePermission } from './assert-purpose-permission';

export interface CreateGoodsIssueDto {
  locationId: string;
  providerId?: string;
  /** Đối tượng kind (supplier | customer). When set, the counterparty is
   *  validated and routed: supplier→provider_id, customer→counterparty cols. */
  counterpartyKind?: DocCounterpartyKind;
  counterpartyId?: string;
  purpose?: GoodsIssuePurpose;
  reasonId?: string;
  targetBranchId?: string;
  reason?: string; // optional override / legacy
  /** Source document id (e.g. the transfer order this issue was created from). */
  referenceId?: string;
  /** Source document type — see GoodsIssueReferenceType. */
  referenceType?: GoodsIssueReferenceType;
  notes?: string;
  /** Free-text deliverer name (Người giao). */
  deliverer?: string;
  /** FE-supplied reference codes shown as Tham chiếu. */
  references?: string[];
  /** User-entered issue date+time (ISO); falls back to createdAt when omitted. */
  occurredAt?: string;
  lines: {
    itemId: string;
    locationId?: string;
    quantity: number;
    unitPrice?: number;
    notes?: string;
  }[];
}

export interface GoodsIssueQuery extends PaginationQuery {
  status?: GoodsIssueStatus;
  organizationId: string;
  branchId?: string;
}

const VALID_TRANSITIONS: Record<GoodsIssueStatus, GoodsIssueStatus[]> = {
  [GoodsIssueStatus.DRAFT]: [GoodsIssueStatus.POSTED, GoodsIssueStatus.CANCELLED],
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
    @InjectRepository(IssueReasonEntity)
    private readonly reasonRepo: Repository<IssueReasonEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly documentNumberingService: DocumentNumberingService,
    @Inject(forwardRef(() => TransferOrderService))
    private readonly transferOrderService: TransferOrderService,
    private readonly rbac: RbacService,
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

    const purpose = dto.purpose ?? GoodsIssuePurpose.OTHER;
    // Body-based defense-in-depth behind the FE filter: gate OTHER/DISPOSAL
    // behind their dedicated permission keys. Covers both the v2 CQRS handler
    // and the legacy createAndPost path, which both funnel through create().
    await assertPurposePermission(this.rbac, actor, purpose);
    const { reasonText, reasonId, targetBranchId } = await this.resolveReasonContext(
      purpose,
      dto,
      actor,
    );

    const documentNumber = await this.documentNumberingService.generate(
      DocumentType.GOODS_ISSUE,
      actor.branchId,
      actor,
    );

    const counterparty = await resolveDocCounterparty(
      this.dataSource.manager,
      dto,
      actor.organizationId,
    );

    const gi = this.giRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      locationId: dto.locationId,
      providerId: counterparty.providerId,
      counterpartyKind: counterparty.counterpartyKind,
      counterpartyId: counterparty.counterpartyId,
      purpose,
      reason: reasonText,
      reasonId,
      targetBranchId,
      referenceId: dto.referenceId,
      referenceType: dto.referenceType,
      notes: dto.notes,
      deliverer: dto.deliverer ?? null,
      references: dto.references ?? [],
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
      status: GoodsIssueStatus.DRAFT,
      lines: dto.lines.map((l) => {
        const line = new GoodsIssueLineEntity();
        line.itemId = l.itemId;
        // Honor a per-line source location (used by transfer export where each
        // line can be pulled from a different warehouse); fall back to header.
        line.locationId = l.locationId ?? dto.locationId;
        line.quantity = l.quantity;

        const unitPrice = Number(l.unitPrice ?? 0);
        const qty = Number(l.quantity);
        line.unitPrice = unitPrice.toFixed(2);
        line.lineTotal = (qty * unitPrice).toFixed(2);
        line.notes = l.notes;
        return line;
      }),
    });

    const saved = await this.giRepo.save(gi);
    this.logger.log(
      `Goods issue ${saved.id} created as DRAFT ${documentNumber} (purpose=${purpose})`,
    );
    return saved;
  }

  /**
   * Create + post in one atomic action: persist the
   * DRAFT, then immediately post it (writes the stock ledger and flips status
   * to POSTED). If posting fails — e.g. the ledger write rejects — the just
   * created DRAFT is hard-deleted (its lines cascade away) so no orphan is
   * left behind. End state is either POSTED (number + ledger) or nothing.
   */
  async createAndPost(
    dto: CreateGoodsIssueDto,
    actor: ActorContext,
  ): Promise<GoodsIssueEntity> {
    const draft = await this.create(dto, actor);
    try {
      return await this.post(draft.id, actor);
    } catch (err) {
      // Roll back the orphan DRAFT so the failed "Lưu" persists nothing.
      // onDelete: CASCADE on goods_issue_lines removes the lines with it.
      await this.giRepo.delete({ id: draft.id, organizationId: actor.organizationId });
      this.logger.warn(
        `createAndPost rolled back draft ${draft.id}: ${(err as Error).message}`,
      );
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(
        'Không thể xuất kho phiếu này. Vui lòng kiểm tra tồn kho và thử lại.',
      );
    }
  }

  async post(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);
    this.validateTransition(gi.status, GoodsIssueStatus.POSTED);

    const documentNumber =
      gi.documentNumber ??
      (await this.documentNumberingService.generate(
        DocumentType.GOODS_ISSUE,
        gi.branchId,
        actor,
      ));

    const branchId = gi.branchId ?? actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Không xác định được chi nhánh để xuất hàng');
    }

    const costByItemId = new Map<string, number>();
    for (const itemId of new Set(gi.lines.map((line) => line.itemId))) {
      const average = await this.ledgerService.getInstantAverageCost(
        itemId,
        gi.organizationId,
        branchId,
      );
      costByItemId.set(itemId, average.unitCost);
    }

    const entries = await this.dataSource.transaction(async (manager) => {
      const movements: RecordMovementParams[] = gi.lines.map((line) => ({
        itemId: line.itemId,
        locationId: line.locationId,
        branchId,
        organizationId: gi.organizationId,
        movementType: StockMovementType.GOODS_ISSUE,
        quantity: -line.quantity,
        referenceType: 'GOODS_ISSUE',
        referenceId: gi.id,
        notes: `Xuất hàng: ${documentNumber}`,
        actorContext: actor,
        unitCost: costByItemId.get(line.itemId) ?? 0,
      }));

      for (const line of gi.lines) {
        const unitCost = costByItemId.get(line.itemId) ?? 0;
        await manager.update(
          GoodsIssueLineEntity,
          { id: line.id },
          {
            unitPrice: unitCost.toFixed(2),
            lineTotal: (Number(line.quantity) * unitCost).toFixed(2),
          },
        );
      }

      const savedEntries = await this.ledgerService.recordBatchMovements(
        movements,
        manager,
      );

      await manager.update(GoodsIssueEntity, id, {
        status: GoodsIssueStatus.POSTED,
        documentNumber,
        postedBy: actor.userId,
        postedAt: new Date(),
      });
      return savedEntries;
    });
    await this.ledgerService.publishMovementEvents(entries);

    this.logger.log(`Goods issue ${id} posted as ${documentNumber}`);
    return this.findOrFail(id, actor.organizationId, actor.branchId);
  }

  async cancel(
    id: string,
    actor: ActorContext,
    options: { cascadeTransferOrder?: boolean } = {},
  ): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);

    if (gi.status === GoodsIssueStatus.CANCELLED) {
      throw new ConflictException('Phiếu đã huỷ, không thể xoá lại');
    }

    if (gi.status === GoodsIssueStatus.POSTED) {
      const branchId = gi.branchId ?? actor.branchId;
      if (!branchId) {
        throw new BadRequestException(
          'Không xác định được chi nhánh để đảo bút tồn kho',
        );
      }
      const entries = await this.dataSource.transaction(async (manager) => {
        const reversals: RecordMovementParams[] = gi.lines.map((line) => ({
          itemId: line.itemId,
          locationId: line.locationId,
          branchId,
          organizationId: gi.organizationId,
          movementType: StockMovementType.ADJUSTMENT_INCREASE,
          quantity: Number(line.quantity),
          referenceType: 'GOODS_ISSUE',
          referenceId: gi.id,
          notes: `Huỷ phiếu xuất kho ${gi.documentNumber ?? gi.id}`,
          actorContext: actor,
          unitCost: Number(line.unitPrice ?? 0),
        }));
        return this.ledgerService.recordBatchMovements(reversals, manager);
      });
      await this.ledgerService.publishMovementEvents(entries);
    }

    gi.status = GoodsIssueStatus.CANCELLED;
    const saved = await this.giRepo.save(gi);
    this.logger.log(`Goods issue ${id} cancelled by ${actor.userId}`);

    // When this issue is the export leg of a transfer order, deleting it must
    // also roll back the transfer: reverse the destination goods receipt (if the
    // order was already imported) and soft-delete the order. Skip when the
    // transfer-order cancel path drives the reversal itself, to avoid a loop.
    if (
      options.cascadeTransferOrder !== false &&
      gi.referenceType === GoodsIssueReferenceType.TRANSFER_ORDER &&
      gi.referenceId
    ) {
      await this.transferOrderService.cancelFromExportIssue(
        gi.referenceId,
        actor,
      );
    }

    return saved;
  }

  async getById(id: string, actor: ActorContext): Promise<GoodsIssueEntity> {
    const gi = await this.findOrFail(id, actor.organizationId, actor.branchId);
    await attachCounterparties(this.giRepo.manager, [gi], actor.organizationId);
    return gi;
  }

  async list(query: GoodsIssueQuery): Promise<PaginatedResponse<GoodsIssueEntity>> {
    const where: Record<string, unknown> = { organizationId: query.organizationId };
    if (query.status) {
      where.status = query.status;
    } else {
      // GoodsIssueEntity has no soft-delete column, so we hide cancelled rows
      // here. Callers wanting the full set can filter explicitly by status.
      where.status = Not(GoodsIssueStatus.CANCELLED);
    }
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

  private async resolveReasonContext(
    purpose: GoodsIssuePurpose,
    dto: CreateGoodsIssueDto,
    actor: ActorContext,
  ): Promise<{ reasonText: string; reasonId?: string; targetBranchId?: string }> {
    switch (purpose) {
      case GoodsIssuePurpose.OTHER:
      case GoodsIssuePurpose.DISPOSAL: {
        if (dto.reasonId) {
          const reason = await this.reasonRepo.findOne({
            where: { id: dto.reasonId, organizationId: actor.organizationId },
          });
          if (!reason) {
            throw new BadRequestException(`Lý do xuất kho ${dto.reasonId} không tồn tại`);
          }
          return { reasonText: reason.name, reasonId: reason.id };
        }
        const fallback =
          purpose === GoodsIssuePurpose.DISPOSAL ? 'Xuất huỷ' : 'Xuất khác';
        return { reasonText: dto.reason ?? fallback };
      }
      case GoodsIssuePurpose.TRANSFER_OUT: {
        if (!dto.targetBranchId) {
          throw new BadRequestException(
            'Vui lòng chọn cửa hàng đích để điều chuyển',
          );
        }
        if (actor.branchId && dto.targetBranchId === actor.branchId) {
          throw new BadRequestException(
            'Cửa hàng đích phải khác cửa hàng hiện tại',
          );
        }
        const branch = await this.branchRepo.findOne({
          where: { id: dto.targetBranchId, organizationId: actor.organizationId },
        });
        if (!branch) {
          throw new BadRequestException(
            `Chi nhánh ${dto.targetBranchId} không tồn tại`,
          );
        }
        return {
          reasonText: `Điều chuyển đến cửa hàng ${branch.name}`,
          targetBranchId: branch.id,
        };
      }
      case GoodsIssuePurpose.SALE: {
        // POS flow — preserves any reason text passed in
        return { reasonText: dto.reason ?? 'Bán hàng' };
      }
      default:
        return { reasonText: dto.reason ?? 'Khác' };
    }
  }

  private async findOrFail(
    id: string,
    organizationId: string,
    branchId?: string,
  ): Promise<GoodsIssueEntity> {
    const gi = await this.giRepo.findOne({
      where: { id, organizationId, ...(branchId ? { branchId } : {}) },
    });
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
