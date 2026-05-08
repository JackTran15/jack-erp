import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountCodeEntity } from './discount-code.entity';
import { VoucherEntity } from './voucher.entity';
import { PromotionEntity } from './promotion.entity';
import { InvoicePromotionEntity } from './invoice-promotion.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { DiscountCodeService } from './discount-code.service';
import { VoucherService } from './voucher.service';
import { PromotionService } from './promotion.service';
import { PromotionApplyService } from './promotion-apply.service';
import { PromotionController } from './promotion.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DiscountCodeEntity,
      VoucherEntity,
      PromotionEntity,
      InvoicePromotionEntity,
      InvoiceEntity,
    ]),
  ],
  controllers: [PromotionController],
  providers: [DiscountCodeService, VoucherService, PromotionService, PromotionApplyService],
  exports: [DiscountCodeService, VoucherService, PromotionService, PromotionApplyService],
})
export class PromotionModule {}
