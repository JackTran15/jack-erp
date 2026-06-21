import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import { GoodsReceiptService } from '../goods-receipt.service';
import { PostGoodsReceiptV2Command } from './post-goods-receipt-v2.command';

/**
 * Posts a v2 DRAFT receipt (DRAFT → POSTED). The DRAFT → POSTED transition writes
 * the stock ledger, supplier debt (nợ NCC) and cash/journal entries — audited,
 * MISA-aligned logic that is deliberately reused via the proven domain service
 * rather than reimplemented, so the financial postings stay identical.
 */
@CommandHandler(PostGoodsReceiptV2Command)
export class PostGoodsReceiptV2Handler
  implements ICommandHandler<PostGoodsReceiptV2Command>
{
  constructor(private readonly goodsReceiptService: GoodsReceiptService) {}

  execute({ id, actor }: PostGoodsReceiptV2Command): Promise<GoodsReceiptEntity> {
    return this.goodsReceiptService.post(id, actor);
  }
}
