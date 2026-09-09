import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferOrderEntity } from '../transfer-order.entity';
import { TransferOrderLineEntity } from '../transfer-order-line.entity';
import { SearchTransferOrderLinesV2Query } from './search-transfer-order-lines-v2.query';

/**
 * One page of a transfer order's lines (ADR-04). Mirror of
 * `SearchStockTransferLinesV2Handler`, with two things different:
 *
 * 1. Scope predicate matches `TransferOrderService.getById`
 *    (`transfer-order.service.ts:290-295`) exactly: `findOrFail` (org-scoped,
 *    `:2010-2017`) followed by `assertParticipantBranch` (`:2019-2030`). A
 *    transfer order has BOTH a `sourceBranchId` and a `destinationBranchId`,
 *    and both sides are entitled to see it, so the check is
 *    `actor.branchId && (sourceBranchId === actor.branchId ||
 *    destinationBranchId === actor.branchId)` — never a plain
 *    `branchId = actor.branchId` filter, which would 404 the document for
 *    half its legitimate viewers.
 * 2. Each line carries only `item`, `eager: true` on the entity
 *    (`transfer-order-line.entity.ts:67`). The source storage/location are
 *    plain FK columns (`sourceStorageId`, `sourceLocationId`), not relations —
 *    the panel resolves their display names from a separately fetched map
 *    (`TransferOrdersPage.tsx:769`), so nothing extra to join for them.
 */
@QueryHandler(SearchTransferOrderLinesV2Query)
export class SearchTransferOrderLinesV2Handler
  implements IQueryHandler<SearchTransferOrderLinesV2Query>
{
  constructor(
    @InjectRepository(TransferOrderEntity)
    private readonly transferOrderRepo: Repository<TransferOrderEntity>,
    @InjectRepository(TransferOrderLineEntity)
    private readonly lineRepo: Repository<TransferOrderLineEntity>,
  ) {}

  async execute({
    transferOrderId,
    dto,
    actor,
  }: SearchTransferOrderLinesV2Query) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    // 404 before pagination — an id outside the actor's organization/branch
    // participation must not return an empty page, which would leak whether
    // the voucher exists.
    const transferOrder = await this.transferOrderRepo.findOne({
      where: { id: transferOrderId, organizationId: actor.organizationId },
      loadEagerRelations: false,
    });
    if (
      !transferOrder ||
      !actor.branchId ||
      (transferOrder.sourceBranchId !== actor.branchId &&
        transferOrder.destinationBranchId !== actor.branchId)
    ) {
      throw new NotFoundException(`Transfer order ${transferOrderId} not found`);
    }

    const baseQb = () =>
      this.lineRepo
        .createQueryBuilder('line')
        .leftJoin('line.item', 'item')
        .addSelect('item')
        .where('line.transferOrderId = :transferOrderId', { transferOrderId });

    const [data, total] = await Promise.all([
      baseQb()
        .orderBy('line.lineNo', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      baseQb().getCount(),
    ]);

    return { data, page, limit, total };
  }
}
