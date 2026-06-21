import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { assertProductUniformLocation } from '../../location/services/product-location.util';
import { ItemEntity } from '../../location/item.entity';
import { ProviderEntity } from '../../location/provider.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { GoodsIssueEntity } from '../goods-issue.entity';
import {
  CreateGoodsIssueDto,
  GoodsIssueService,
} from '../goods-issue.service';
import { CreateGoodsIssueV2Command } from './create-goods-issue-v2.command';

@CommandHandler(CreateGoodsIssueV2Command)
export class CreateGoodsIssueV2Handler
  implements ICommandHandler<CreateGoodsIssueV2Command>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly goodsIssueService: GoodsIssueService,
  ) {}

  async execute({
    dto,
    actor,
  }: CreateGoodsIssueV2Command): Promise<{ id: string; documentNumber: string | null }> {
    if (!actor.branchId) {
      throw new BadRequestException('An active branch is required to create a goods issue');
    }
    const manager = this.dataSource.manager;
    const orgId = actor.organizationId;

    // Enforce the per-product uniform-location rule on the effective line location
    // (per-line bin, falling back to the header location).
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await manager.find(ItemEntity, {
      where: { id: In(itemIds), organizationId: orgId },
      select: { id: true, productId: true },
    });
    const productByItem = new Map(items.map((i) => [i.id, i.productId ?? null]));
    assertProductUniformLocation(
      dto.lines.map((l) => ({
        itemId: l.itemId,
        productId: productByItem.get(l.itemId) ?? null,
        locationId: l.locationId ?? dto.locationId,
      })),
    );

    await this.validateCounterparty(manager, dto, orgId);

    // A supplier counterparty also populates provider_id so any provider-based
    // reporting keeps working; the DRAFT itself is built by the audited service.
    const providerId =
      dto.counterpartyKind === DocCounterpartyKind.SUPPLIER
        ? dto.counterpartyId
        : undefined;

    const mapped: CreateGoodsIssueDto = {
      locationId: dto.locationId,
      providerId,
      purpose: dto.purpose,
      reasonId: dto.reasonId,
      targetBranchId: dto.targetBranchId,
      reason: dto.reason,
      notes: dto.notes,
      deliverer: dto.deliverer,
      references: dto.references,
      occurredAt: dto.occurredAt,
      lines: dto.lines.map((l) => ({
        itemId: l.itemId,
        locationId: l.locationId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        notes: l.notes,
      })),
    };

    const draft = await this.goodsIssueService.create(mapped, actor);

    if (dto.counterpartyKind) {
      await manager.update(
        GoodsIssueEntity,
        { id: draft.id },
        {
          counterpartyKind: dto.counterpartyKind,
          counterpartyId: dto.counterpartyId ?? null,
        },
      );
    }

    return { id: draft.id, documentNumber: draft.documentNumber ?? null };
  }

  private async validateCounterparty(
    manager: EntityManager,
    dto: CreateGoodsIssueV2Command['dto'],
    orgId: string,
  ): Promise<void> {
    if (!dto.counterpartyKind) return;
    if (!dto.counterpartyId) {
      throw new BadRequestException(
        'counterpartyId is required when counterpartyKind is set',
      );
    }
    if (dto.counterpartyKind === DocCounterpartyKind.SUPPLIER) {
      const provider = await manager.findOne(ProviderEntity, {
        where: { id: dto.counterpartyId, organizationId: orgId },
      });
      if (!provider) {
        throw new BadRequestException('Supplier counterparty not found in organization');
      }
    } else {
      const customer = await manager.findOne(CustomerEntity, {
        where: { id: dto.counterpartyId, organizationId: orgId },
      });
      if (!customer) {
        throw new BadRequestException('Customer counterparty not found in organization');
      }
    }
  }
}
