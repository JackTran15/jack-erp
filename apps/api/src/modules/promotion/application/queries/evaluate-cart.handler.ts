import { BadRequestException, Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PromotionTargetType } from '@erp/shared-interfaces';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { CATALOG_READER, CatalogReaderPort } from '../../domain/ports/catalog-reader.port';
import { CUSTOMER_READER, CustomerReaderPort } from '../../domain/ports/customer-reader.port';
import { PromotionResolver } from '../../domain/engine/promotion-resolver';
import { toEvaluateResponse } from '../dto/evaluate-cart.response.dto';
import { EvaluateCartQuery } from './evaluate-cart.query';

@QueryHandler(EvaluateCartQuery)
export class EvaluateCartHandler implements IQueryHandler<EvaluateCartQuery> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly programs: PromotionRepositoryPort,
    @Inject(CATALOG_READER) private readonly catalog: CatalogReaderPort,
    @Inject(CUSTOMER_READER) private readonly customers: CustomerReaderPort,
    private readonly resolver: PromotionResolver,
  ) {}

  async execute({ dto, actor }: EvaluateCartQuery) {
    const at = dto.at ? new Date(dto.at) : new Date();
    const cartItemIds = [...new Set(dto.lines.map((l) => l.itemId))];

    // `programs` must resolve before catalog.loadItems — gift/reward targets
    // (GIFT_ITEM, BUY_M_GET_N's SPECIFIC mode) reference items that are not
    // necessarily in the cart at all.
    const programs = await this.programs.findActive(actor.organizationId, actor.branchId!, at);
    const targetItemIds = programs
      .flatMap((p) => p.groups.flatMap((g) => g.lines))
      .filter((l) => l.targetType === PromotionTargetType.ITEM)
      .map((l) => l.targetId);
    const itemIds = [...new Set([...cartItemIds, ...targetItemIds])];

    const [catalog, customer] = await Promise.all([
      this.catalog.loadItems(actor.organizationId, itemIds),
      dto.customerId ? this.customers.load(actor.organizationId, dto.customerId) : Promise.resolve(undefined),
    ]);

    // UNKNOWN_ITEM only checks cart lines — a gift/reward target missing from
    // the catalog is a data-quality issue in the promotion itself (handled
    // silently by the engine), not a client error.
    const missing = cartItemIds.filter((id) => !catalog.has(id));
    if (missing.length) throw new BadRequestException({ code: 'UNKNOWN_ITEM', itemIds: missing });
    if (dto.customerId && !customer) throw new BadRequestException({ code: 'UNKNOWN_CUSTOMER' });

    const evaluation = this.resolver.resolve(programs, {
      organizationId: actor.organizationId,
      branchId: actor.branchId!,
      at,
      customer: customer ? { id: dto.customerId!, ...customer } : undefined,
      lines: dto.lines,
      catalog,
      selectedProgramIds: dto.selectedProgramIds ?? [],
    });

    return toEvaluateResponse(evaluation);
  }
}
