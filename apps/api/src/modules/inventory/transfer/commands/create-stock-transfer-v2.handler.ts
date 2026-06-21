import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { assertProductUniformLocation } from '../../location/services/product-location.util';
import { ItemEntity } from '../../location/item.entity';
import {
  BranchScopedTransferInput,
  StockTransferService,
} from '../stock-transfer.service';
import { CreateStockTransferV2Command } from './create-stock-transfer-v2.command';

/**
 * v2 stock transfer. Adds the per-product uniform source-location rule (all
 * variants of one product leave from the same bin), then reuses the audited
 * atomic createAndPost — transfers are atomic in this codebase (no DRAFT phase).
 */
@CommandHandler(CreateStockTransferV2Command)
export class CreateStockTransferV2Handler
  implements ICommandHandler<CreateStockTransferV2Command>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockTransferService: StockTransferService,
  ) {}

  async execute({ dto, actor }: CreateStockTransferV2Command) {
    if (!actor.branchId) {
      throw new BadRequestException('An active branch is required to transfer stock');
    }

    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await this.dataSource.manager.find(ItemEntity, {
      where: { id: In(itemIds), organizationId: actor.organizationId },
      select: { id: true, productId: true },
    });
    const productByItem = new Map(items.map((i) => [i.id, i.productId ?? null]));

    // Enforce uniformity on the explicit source bins; lines whose source location
    // is resolved later by the service (only a storage given) can't be checked here.
    assertProductUniformLocation(
      dto.lines
        .filter((l): l is typeof l & { sourceLocationId: string } =>
          Boolean(l.sourceLocationId),
        )
        .map((l) => ({
          itemId: l.itemId,
          productId: productByItem.get(l.itemId) ?? null,
          locationId: l.sourceLocationId,
        })),
    );

    return this.stockTransferService.createAndPost(
      dto as BranchScopedTransferInput,
      actor,
    );
  }
}
